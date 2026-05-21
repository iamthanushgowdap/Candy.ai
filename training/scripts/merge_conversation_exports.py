#!/usr/bin/env python3
"""
Antgravity — Merge Conversation Exports
=========================================
Simple utility to merge manually-collected or API-exported
conversations into the training dataset pool.

Usage:
    python training/scripts/merge_conversation_exports.py
    python training/scripts/merge_conversation_exports.py --input my_conversations.json
"""

import os
import sys
import json
import hashlib
import argparse
from datetime import datetime

GREEN  = "\033[92m"; YELLOW = "\033[93m"; RED = "\033[91m"
CYAN   = "\033[96m"; BOLD   = "\033[1m";  RESET = "\033[0m"

CONVERSATION_DIR = "training/conversations"
TRAIN_DATASET    = "training/datasets/train.json"


def compute_hash(messages):
    content = json.dumps(messages, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def main():
    parser = argparse.ArgumentParser(description="Merge conversation exports into training data")
    parser.add_argument("--input", default=None, help="Path to conversations JSON file")
    parser.add_argument("--dir",   default=CONVERSATION_DIR, help="Directory of conversation exports")
    args = parser.parse_args()

    print(f"\n{BOLD}{CYAN}Antgravity — Merge Conversation Exports{RESET}\n")

    # Load existing training data
    if os.path.exists(TRAIN_DATASET):
        with open(TRAIN_DATASET, "r", encoding="utf-8") as f:
            existing = json.load(f)
        print(f"  Existing train samples: {len(existing):,}")
    else:
        existing = []
        print(f"  {YELLOW}No existing training dataset — starting fresh{RESET}")

    # Collect existing hashes for dedup
    existing_hashes = {compute_hash(s["messages"]) for s in existing if "messages" in s}

    # Load new conversations
    new_samples = []
    
    if args.input:
        sources = [args.input]
    else:
        sources = [
            os.path.join(args.dir, f)
            for f in os.listdir(args.dir) if f.endswith(".json")
        ] if os.path.exists(args.dir) else []

    for src in sources:
        try:
            with open(src, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                data = [data]
            new_samples.extend(data)
            print(f"  Loaded: {src} ({len(data)} samples)")
        except Exception as e:
            print(f"  {RED}Failed to load {src}: {e}{RESET}")

    # Merge
    added = 0
    for sample in new_samples:
        if "messages" not in sample:
            continue
        h = compute_hash(sample["messages"])
        if h not in existing_hashes:
            existing_hashes.add(h)
            sample["_added_at"] = datetime.utcnow().isoformat()
            existing.append(sample)
            added += 1

    if added > 0:
        with open(TRAIN_DATASET, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        print(f"\n  {GREEN}✓{RESET}  Added {added} new samples → {TRAIN_DATASET}")
        print(f"  Total dataset size: {len(existing):,}")
    else:
        print(f"\n  {YELLOW}No new unique samples found.{RESET}")


if __name__ == "__main__":
    main()
