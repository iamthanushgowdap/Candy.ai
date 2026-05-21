#!/usr/bin/env python3
"""
Antgravity — Dataset Preparation & Validation
===============================================
Validates, deduplicates, and splits the training dataset.
Produces clean train.json and eval.json ready for training.

Usage:
    python training/scripts/prepare_dataset.py
    python training/scripts/prepare_dataset.py --input datasets/final_training_dataset.json
"""

import json
import hashlib
import argparse
import os
import sys
import random
from datetime import datetime
from typing import List, Dict, Any, Tuple

# ── ANSI Colors ───────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"


def ok(msg):   print(f"  {GREEN}✓{RESET}  {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET}  {msg}")
def fail(msg): print(f"  {RED}✗{RESET}  {msg}")
def info(msg): print(f"  {CYAN}ℹ{RESET}  {msg}")


def compute_hash(messages: List[Dict]) -> str:
    """Compute a content hash for deduplication."""
    content = json.dumps(messages, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def validate_sample(sample: Any, index: int) -> Tuple[bool, str]:
    """
    Validate a single training sample.
    Returns (is_valid, reason_if_invalid).
    """
    if not isinstance(sample, dict):
        return False, f"[{index}] Not a dict"

    if "messages" not in sample:
        return False, f"[{index}] Missing 'messages' key"

    messages = sample["messages"]
    if not isinstance(messages, list) or len(messages) < 2:
        return False, f"[{index}] 'messages' must be a list with at least 2 entries"

    # Check all messages have role + non-empty content
    for i, msg in enumerate(messages):
        if not isinstance(msg, dict):
            return False, f"[{index}] Message {i} is not a dict"
        if "role" not in msg or "content" not in msg:
            return False, f"[{index}] Message {i} missing 'role' or 'content'"
        if not isinstance(msg["content"], str) or len(msg["content"].strip()) == 0:
            return False, f"[{index}] Message {i} has empty content"
        if msg["role"] not in ("user", "assistant", "system"):
            return False, f"[{index}] Message {i} has unknown role: {msg['role']}"

    # Must have at least one user and one assistant turn
    roles = {m["role"] for m in messages}
    if "user" not in roles:
        return False, f"[{index}] No user turn found"
    if "assistant" not in roles:
        return False, f"[{index}] No assistant turn found"

    # Check for suspiciously short responses
    assistant_msgs = [m for m in messages if m["role"] == "assistant"]
    if all(len(m["content"].strip()) < 3 for m in assistant_msgs):
        return False, f"[{index}] All assistant responses are too short"

    return True, ""


def prepare_dataset(
    input_path: str,
    train_output: str,
    eval_output: str,
    split_ratio: float = 0.95,
    seed: int = 42
) -> Dict[str, Any]:
    """
    Load, validate, deduplicate, and split the dataset.
    Returns quality report dict.
    """
    print(f"\n{BOLD}── Loading Dataset ───────────────────────────────────{RESET}")
    info(f"Input:  {input_path}")
    info(f"Output: {train_output}, {eval_output}")

    if not os.path.exists(input_path):
        fail(f"Dataset not found: {input_path}")
        sys.exit(1)

    with open(input_path, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    ok(f"Loaded {len(raw_data):,} raw samples ({os.path.getsize(input_path) / 1024 / 1024:.1f} MB)")

    # ── Validation Pass ────────────────────────────────────────────────────────
    print(f"\n{BOLD}── Validation ────────────────────────────────────────{RESET}")
    valid_samples = []
    invalid_reasons = []

    for i, sample in enumerate(raw_data):
        is_valid, reason = validate_sample(sample, i)
        if is_valid:
            valid_samples.append(sample)
        else:
            invalid_reasons.append(reason)

    ok(f"Valid samples:   {len(valid_samples):,}")
    if invalid_reasons:
        warn(f"Invalid samples: {len(invalid_reasons):,} (removed)")
        # Show first 5 invalid reasons
        for r in invalid_reasons[:5]:
            info(f"  → {r}")
        if len(invalid_reasons) > 5:
            info(f"  ... and {len(invalid_reasons) - 5} more")

    # ── Deduplication ──────────────────────────────────────────────────────────
    print(f"\n{BOLD}── Deduplication ─────────────────────────────────────{RESET}")
    seen_hashes = set()
    deduped_samples = []

    for sample in valid_samples:
        h = compute_hash(sample["messages"])
        if h not in seen_hashes:
            seen_hashes.add(h)
            deduped_samples.append(sample)

    duplicates_removed = len(valid_samples) - len(deduped_samples)
    if duplicates_removed > 0:
        warn(f"Removed {duplicates_removed:,} duplicate samples")
    else:
        ok("No duplicates found")
    ok(f"Clean samples: {len(deduped_samples):,}")

    # ── Token Length Estimation ────────────────────────────────────────────────
    print(f"\n{BOLD}── Length Analysis ───────────────────────────────────{RESET}")
    lengths = []
    too_long = 0
    MAX_CHARS = 512 * 4  # Rough char estimate for 512 tokens

    filtered_samples = []
    for sample in deduped_samples:
        total_chars = sum(len(m["content"]) for m in sample["messages"])
        lengths.append(total_chars)
        if total_chars <= MAX_CHARS * 2:  # Allow 2x for truncation rather than removal
            filtered_samples.append(sample)
        else:
            too_long += 1

    avg_len = sum(lengths) / len(lengths) if lengths else 0
    info(f"Avg sample length: {avg_len:.0f} chars")
    info(f"Max sample length: {max(lengths) if lengths else 0:,} chars")
    if too_long > 0:
        warn(f"Extremely long samples (>4096 chars): {too_long:,} — will be truncated during training")

    # ── Shuffle & Split ────────────────────────────────────────────────────────
    print(f"\n{BOLD}── Splitting Dataset ─────────────────────────────────{RESET}")
    random.seed(seed)
    random.shuffle(filtered_samples)

    split_idx = int(len(filtered_samples) * split_ratio)
    train_data = filtered_samples[:split_idx]
    eval_data  = filtered_samples[split_idx:]

    ok(f"Train set: {len(train_data):,} samples")
    ok(f"Eval set:  {len(eval_data):,} samples")

    # ── Save Outputs ───────────────────────────────────────────────────────────
    print(f"\n{BOLD}── Saving Outputs ────────────────────────────────────{RESET}")
    os.makedirs(os.path.dirname(train_output), exist_ok=True)

    with open(train_output, "w", encoding="utf-8") as f:
        json.dump(train_data, f, ensure_ascii=False, indent=2)
    ok(f"Saved: {train_output} ({os.path.getsize(train_output) / 1024 / 1024:.1f} MB)")

    with open(eval_output, "w", encoding="utf-8") as f:
        json.dump(eval_data, f, ensure_ascii=False, indent=2)
    ok(f"Saved: {eval_output} ({os.path.getsize(eval_output) / 1024 / 1024:.1f} MB)")

    # ── Quality Report ─────────────────────────────────────────────────────────
    report = {
        "prepared_at": datetime.utcnow().isoformat(),
        "input_path": input_path,
        "raw_count": len(raw_data),
        "invalid_count": len(invalid_reasons),
        "duplicate_count": duplicates_removed,
        "final_count": len(filtered_samples),
        "train_count": len(train_data),
        "eval_count": len(eval_data),
        "avg_length_chars": round(avg_len, 1),
        "invalid_reasons_sample": invalid_reasons[:10]
    }

    report_path = "training/logs/dataset_report.json"
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    ok(f"Quality report: {report_path}")

    return report


def main():
    parser = argparse.ArgumentParser(description="Antgravity Dataset Preparation")
    parser.add_argument("--input", default="datasets/final_training_dataset.json")
    parser.add_argument("--train-out", default="training/datasets/train.json")
    parser.add_argument("--eval-out",  default="training/datasets/eval.json")
    parser.add_argument("--split", type=float, default=0.95)
    parser.add_argument("--seed",  type=int,   default=42)
    args = parser.parse_args()

    print(f"\n{BOLD}{CYAN}╔══════════════════════════════════════╗")
    print(f"║  Antgravity Dataset Preparation      ║")
    print(f"╚══════════════════════════════════════╝{RESET}")

    report = prepare_dataset(
        input_path=args.input,
        train_output=args.train_out,
        eval_output=args.eval_out,
        split_ratio=args.split,
        seed=args.seed
    )

    print(f"\n{BOLD}── Complete ───────────────────────────────────────────{RESET}")
    print(f"  {BOLD}Final dataset: {report['final_count']:,} clean samples{RESET}")
    print(f"  Train: {report['train_count']:,}  |  Eval: {report['eval_count']:,}")
    print(f"\n  {BOLD}Next step:{RESET}")
    print(f"  {CYAN}python training/train.py --smoke-test{RESET}")
    print()


if __name__ == "__main__":
    main()
