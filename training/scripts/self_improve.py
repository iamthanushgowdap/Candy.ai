#!/usr/bin/env python3
"""
Antgravity — Synthetic Self-Improvement Pipeline
==================================================
THE MOST IMPORTANT SCRIPT IN THE TRAINING ARCHITECTURE.

Implements the continuous model evolution loop:

  conversation → user correction → export → clean → retrain → improved model

This script orchestrates the full self-improvement cycle:
1. Import exported conversations from Supabase/API
2. Optionally apply user corrections/ratings
3. Validate and clean new conversation data
4. Merge with existing training dataset
5. Trigger a new training run (incremental, new version)
6. Log evolution history

Architecture:
  training/conversations/     ← raw exported conversations (from API)
  training/conversations/corrections/  ← user-corrected samples
  training/datasets/evolution.json     ← merged evolution dataset
  training/logs/evolution_history.json ← full version history

Usage:
    python training/scripts/self_improve.py --check
    python training/scripts/self_improve.py --merge-only
    python training/scripts/self_improve.py --run
    python training/scripts/self_improve.py --history
"""

import os
import sys
import json
import hashlib
import argparse
import subprocess
from datetime import datetime
from typing import List, Dict, Any, Optional

GREEN  = "\033[92m"; YELLOW = "\033[93m"; RED    = "\033[91m"
CYAN   = "\033[96m"; BOLD   = "\033[1m";  RESET  = "\033[0m"

CONVERSATION_DIR  = "training/conversations"
CORRECTIONS_DIR   = "training/conversations/corrections"
EVOLUTION_DATASET = "training/datasets/evolution.json"
EVOLUTION_HISTORY = "training/logs/evolution_history.json"
BASE_DATASET      = "training/datasets/train.json"


def ok(msg):   print(f"  {GREEN}✓{RESET}  {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET}  {msg}")
def fail(msg): print(f"  {RED}✗{RESET}  {msg}")
def info(msg): print(f"  {CYAN}ℹ{RESET}  {msg}")
def step(msg): print(f"\n{BOLD}{CYAN}▸ {msg}{RESET}")


def compute_hash(messages: List[Dict]) -> str:
    content = json.dumps(messages, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def load_conversation_exports() -> List[Dict]:
    """
    Load all conversation exports from training/conversations/.
    Expects files in the format: { messages: [...] } or [ { messages: [...] }, ... ]
    """
    if not os.path.exists(CONVERSATION_DIR):
        return []

    all_samples = []
    export_files = [
        f for f in os.listdir(CONVERSATION_DIR)
        if f.endswith(".json") and os.path.isfile(os.path.join(CONVERSATION_DIR, f))
    ]

    for filename in export_files:
        path = os.path.join(CONVERSATION_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            # Handle single sample or array
            if isinstance(data, dict) and "messages" in data:
                all_samples.append(data)
            elif isinstance(data, list):
                all_samples.extend([s for s in data if isinstance(s, dict) and "messages" in s])

        except Exception as e:
            warn(f"Failed to load {filename}: {e}")

    return all_samples


def load_corrections() -> List[Dict]:
    """
    Load user-corrected samples from training/conversations/corrections/.
    Corrections take priority over raw exports (prefer_corrected=True in merge).
    Each correction file: { "original_hash": "...", "messages": [...], "correction_note": "..." }
    """
    if not os.path.exists(CORRECTIONS_DIR):
        return []

    corrections = []
    for filename in os.listdir(CORRECTIONS_DIR):
        if filename.endswith(".json"):
            path = os.path.join(CORRECTIONS_DIR, filename)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict) and "messages" in data:
                    data["_is_correction"] = True
                    corrections.append(data)
            except Exception as e:
                warn(f"Failed to load correction {filename}: {e}")

    return corrections


def validate_sample(sample: Dict) -> bool:
    """Quick validation — must have user + assistant turns with non-empty content."""
    messages = sample.get("messages", [])
    if len(messages) < 2:
        return False
    roles = {m.get("role") for m in messages}
    if "user" not in roles or "assistant" not in roles:
        return False
    return all(len(m.get("content", "").strip()) > 0 for m in messages)


def merge_datasets(
    base_samples: List[Dict],
    new_samples: List[Dict],
    corrections: List[Dict]
) -> tuple[List[Dict], Dict]:
    """
    Merge base dataset with new exports and corrections.
    
    Priority: corrections > new exports > base dataset
    Deduplication: SHA-256 hash on message content
    """
    seen_hashes = set()
    merged = []
    stats = {
        "base": 0, "new_exports": 0, "corrections": 0,
        "duplicates_skipped": 0, "invalid_skipped": 0
    }

    # 1. Corrections first (highest priority)
    for sample in corrections:
        if not validate_sample(sample):
            stats["invalid_skipped"] += 1
            continue
        h = compute_hash(sample["messages"])
        if h not in seen_hashes:
            seen_hashes.add(h)
            sample["_source"] = "correction"
            merged.append(sample)
            stats["corrections"] += 1

    # 2. New exports
    for sample in new_samples:
        if not validate_sample(sample):
            stats["invalid_skipped"] += 1
            continue
        h = compute_hash(sample["messages"])
        if h not in seen_hashes:
            seen_hashes.add(h)
            sample["_source"] = "export"
            merged.append(sample)
            stats["new_exports"] += 1
        else:
            stats["duplicates_skipped"] += 1

    # 3. Base dataset (lowest priority — fill in remaining)
    for sample in base_samples:
        if not validate_sample(sample):
            stats["invalid_skipped"] += 1
            continue
        h = compute_hash(sample["messages"])
        if h not in seen_hashes:
            seen_hashes.add(h)
            sample["_source"] = "base"
            merged.append(sample)
            stats["base"] += 1
        else:
            stats["duplicates_skipped"] += 1

    return merged, stats


def load_evolution_history() -> List[Dict]:
    if os.path.exists(EVOLUTION_HISTORY):
        with open(EVOLUTION_HISTORY, "r") as f:
            return json.load(f)
    return []


def save_evolution_history(history: List[Dict]):
    os.makedirs(os.path.dirname(EVOLUTION_HISTORY), exist_ok=True)
    with open(EVOLUTION_HISTORY, "w") as f:
        json.dump(history, f, indent=2)


def print_history():
    history = load_evolution_history()
    if not history:
        print(f"{YELLOW}No evolution history yet.{RESET}")
        return

    print(f"\n{BOLD}{CYAN}╔════════════════════════════════════════════╗")
    print(f"║  Antgravity Model Evolution History        ║")
    print(f"╚════════════════════════════════════════════╝{RESET}")
    for entry in history:
        print(f"\n  {BOLD}{entry.get('version', '?')}{RESET}")
        print(f"    Date:        {entry.get('trained_at', '?')[:19]}")
        print(f"    Samples:     {entry.get('total_samples', '?'):,}")
        print(f"    New exports: +{entry.get('new_exports', 0)}")
        print(f"    Corrections: +{entry.get('corrections', 0)}")
        print(f"    Smoke test:  {'yes' if entry.get('smoke_test') else 'no'}")
        if entry.get("notes"):
            print(f"    Notes:       {entry['notes']}")


def run_self_improvement_cycle(smoke_test: bool = False, notes: str = ""):
    """
    Full self-improvement cycle:
    1. Load exports + corrections
    2. Merge with base dataset
    3. Save evolution dataset
    4. Trigger training
    5. Log history
    """
    step("Loading conversation exports")
    exports = load_conversation_exports()
    corrections = load_corrections()
    ok(f"Loaded {len(exports)} raw exports, {len(corrections)} corrections")

    step("Loading base training dataset")
    if os.path.exists(BASE_DATASET):
        with open(BASE_DATASET, "r", encoding="utf-8") as f:
            base_data = json.load(f)
        ok(f"Base dataset: {len(base_data):,} samples")
    else:
        warn("No base dataset found — training only on exports+corrections")
        base_data = []

    step("Merging datasets")
    merged, stats = merge_datasets(base_data, exports, corrections)

    print(f"\n  Merge results:")
    info(f"  From base dataset:  {stats['base']:,}")
    info(f"  From new exports:   {stats['new_exports']:,}")
    info(f"  From corrections:   {stats['corrections']:,}")
    warn(f"  Duplicates skipped: {stats['duplicates_skipped']:,}")
    warn(f"  Invalid skipped:    {stats['invalid_skipped']:,}")
    ok(f"  Total merged:       {len(merged):,}")

    if len(merged) == len(base_data) and not exports and not corrections:
        warn("No new data to incorporate. Skipping training.")
        info("Export conversations via the UI first, then re-run.")
        return

    step("Saving evolution dataset")
    os.makedirs(os.path.dirname(EVOLUTION_DATASET), exist_ok=True)
    with open(EVOLUTION_DATASET, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    ok(f"Saved: {EVOLUTION_DATASET} ({len(merged):,} samples)")

    # Update train.json to point to evolution dataset
    import shutil
    shutil.copy(EVOLUTION_DATASET, BASE_DATASET)
    ok(f"Updated base dataset: {BASE_DATASET}")

    step("Triggering training run")
    cmd = [sys.executable, "training/train.py"]
    if smoke_test:
        cmd.append("--smoke-test")
    info(f"Running: {' '.join(cmd)}")

    result = subprocess.run(cmd, cwd=".")
    success = result.returncode == 0

    if success:
        ok("Training completed successfully")
    else:
        fail(f"Training exited with code {result.returncode}")

    # Log history
    history = load_evolution_history()
    history.append({
        "trained_at": datetime.utcnow().isoformat(),
        "smoke_test": smoke_test,
        "total_samples": len(merged),
        "base_samples": stats["base"],
        "new_exports": stats["new_exports"],
        "corrections": stats["corrections"],
        "duplicates_skipped": stats["duplicates_skipped"],
        "training_success": success,
        "notes": notes
    })
    save_evolution_history(history)
    ok("Evolution history updated")

    print(f"\n{BOLD}{GREEN}Self-improvement cycle complete!{RESET}")
    print(f"  Total model evolutions: {len(history)}")


def check_status():
    """Show current state of the self-improvement pipeline."""
    print(f"\n{BOLD}{CYAN}Self-Improvement Pipeline Status{RESET}")
    print()

    exports = load_conversation_exports()
    corrections = load_corrections()

    info(f"Conversation exports ready: {len(exports)}")
    info(f"Corrections ready:          {len(corrections)}")

    if os.path.exists(BASE_DATASET):
        with open(BASE_DATASET, "r") as f:
            base = json.load(f)
        info(f"Base dataset samples:       {len(base):,}")
    else:
        warn("No base dataset found — run prepare_dataset.py first")

    history = load_evolution_history()
    info(f"Evolution cycles completed: {len(history)}")

    if exports or corrections:
        print(f"\n  {GREEN}Ready for improvement cycle!{RESET}")
        print(f"  Run: {CYAN}python training/scripts/self_improve.py --run{RESET}")
    else:
        print(f"\n  {YELLOW}No new data yet.{RESET}")
        print(f"  Export conversations from the Antgravity UI first.")


def main():
    parser = argparse.ArgumentParser(description="Antgravity Self-Improvement Pipeline")
    parser.add_argument("--run",        action="store_true", help="Run full improvement cycle")
    parser.add_argument("--merge-only", action="store_true", help="Merge datasets without training")
    parser.add_argument("--check",      action="store_true", help="Check pipeline status")
    parser.add_argument("--history",    action="store_true", help="Show evolution history")
    parser.add_argument("--smoke-test", action="store_true", help="Use smoke test mode for training")
    parser.add_argument("--notes",      default="",           help="Notes to attach to this evolution")
    args = parser.parse_args()

    print(f"\n{BOLD}{CYAN}╔══════════════════════════════════════════════╗")
    print(f"║  Antgravity Self-Improvement Pipeline        ║")
    print(f"╚══════════════════════════════════════════════╝{RESET}")

    os.makedirs(CONVERSATION_DIR, exist_ok=True)
    os.makedirs(CORRECTIONS_DIR, exist_ok=True)

    if args.history:
        print_history()
    elif args.check:
        check_status()
    elif args.merge_only:
        exports     = load_conversation_exports()
        corrections = load_corrections()
        base_data   = json.load(open(BASE_DATASET)) if os.path.exists(BASE_DATASET) else []
        merged, stats = merge_datasets(base_data, exports, corrections)
        os.makedirs(os.path.dirname(EVOLUTION_DATASET), exist_ok=True)
        with open(EVOLUTION_DATASET, "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)
        ok(f"Merged dataset saved: {EVOLUTION_DATASET} ({len(merged):,} samples)")
    elif args.run:
        run_self_improvement_cycle(smoke_test=args.smoke_test, notes=args.notes)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
