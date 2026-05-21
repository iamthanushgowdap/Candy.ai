#!/usr/bin/env python3
"""
Antgravity — Live Training Monitor
=====================================
Watches the JSONL training log in real-time and displays
a live dashboard in the terminal.

Run this in a SEPARATE terminal while training is running:
    python training/scripts/monitor_training.py
    python training/scripts/monitor_training.py --log training/logs/training_antgravity-v1_*.jsonl
"""

import os
import sys
import json
import time
import glob
import argparse
from datetime import datetime

GREEN  = "\033[92m"; YELLOW = "\033[93m"; RED    = "\033[91m"
CYAN   = "\033[96m"; BOLD   = "\033[1m";  RESET  = "\033[0m"
CLEAR  = "\033[2J\033[H"


def find_latest_log(log_dir: str = "training/logs") -> str | None:
    pattern = os.path.join(log_dir, "training_*.jsonl")
    logs = sorted(glob.glob(pattern))
    return logs[-1] if logs else None


def loss_bar(loss: float, width: int = 20) -> str:
    """ASCII bar representing loss (lower = fuller = better)."""
    capped = min(loss, 3.0)
    filled = max(0, int((1 - capped / 3.0) * width))
    bar = "█" * filled + "░" * (width - filled)
    color = GREEN if capped < 1.0 else YELLOW if capped < 2.0 else RED
    return f"{color}{bar}{RESET}"


def vram_bar(used_gb: float, total_gb: float = 4.0, width: int = 20) -> str:
    ratio = min(1.0, used_gb / total_gb)
    filled = int(ratio * width)
    bar = "█" * filled + "░" * (width - filled)
    color = GREEN if ratio < 0.7 else YELLOW if ratio < 0.9 else RED
    return f"{color}{bar}{RESET}"


def format_eta(elapsed_s: float, step: int, total_steps: int) -> str:
    if step == 0:
        return "—"
    per_step = elapsed_s / step
    remaining = per_step * (total_steps - step)
    mins = int(remaining // 60)
    secs = int(remaining % 60)
    return f"{mins}m {secs}s"


def read_events(log_path: str) -> list:
    events = []
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    except FileNotFoundError:
        pass
    return events


def render_dashboard(events: list, log_path: str):
    step_events = [e for e in events if e.get("event") == "step"]
    start_events = [e for e in events if e.get("event") == "training_start"]
    epoch_events = [e for e in events if e.get("event") == "epoch_end"]
    complete_events = [e for e in events if e.get("event") == "training_complete"]
    oom_events = [e for e in events if e.get("event") == "oom_recovery"]
    resume_events = [e for e in events if e.get("event") == "resume"]

    # Parse start info
    version = "unknown"
    smoke_test = False
    if start_events:
        start = start_events[-1]
        version = start.get("version", "unknown")
        smoke_test = start.get("smoke_test", False)

    # Latest step info
    latest_loss = None
    latest_vram_used = 0
    latest_vram_total = 4.0
    current_step = 0
    current_epoch = 0
    elapsed_s = 0
    learning_rate = 0

    if step_events:
        last = step_events[-1]
        latest_loss     = last.get("loss")
        latest_vram_used = last.get("vram_reserved_gb", 0)
        current_step    = last.get("step", 0)
        current_epoch   = last.get("epoch", 0)
        elapsed_s       = last.get("elapsed_seconds", 0)
        learning_rate   = last.get("learning_rate", 0)

    # Loss history (last 20)
    recent_losses = [
        e["loss"] for e in step_events[-20:]
        if e.get("loss") is not None
    ]

    is_complete = bool(complete_events)
    is_resumed  = bool(resume_events)

    # ── Render ────────────────────────────────────────────────────────────────
    print(CLEAR, end="")
    print(f"{BOLD}{CYAN}╔═══════════════════════════════════════════════════════╗")
    print(f"║      Antgravity Training Monitor                      ║")
    print(f"╚═══════════════════════════════════════════════════════╝{RESET}")
    print(f"  Log:     {log_path}")
    print(f"  Version: {BOLD}{version}{RESET}{'  [SMOKE TEST]' if smoke_test else ''}{'  [RESUMED]' if is_resumed else ''}")
    print()

    if is_complete:
        final = complete_events[-1]
        print(f"  {GREEN}{BOLD}✓ Training Complete!{RESET}")
        print(f"  Duration: {final.get('duration_seconds', 0) / 60:.1f} min")
        print(f"  Final loss: {final.get('train_loss', '—')}")
        return

    # Status indicators
    status = f"{GREEN}● Training{RESET}" if step_events else f"{YELLOW}● Waiting for first step...{RESET}"
    if oom_events:
        status += f"  {YELLOW}⚠ OOM recovery ×{len(oom_events)}{RESET}"
    print(f"  Status: {status}")
    print()

    # Loss
    loss_str = f"{latest_loss:.4f}" if latest_loss is not None else "—"
    loss_b   = loss_bar(latest_loss or 3.0)
    print(f"  {BOLD}Loss:{RESET}  {loss_str:>8}  {loss_b}")

    # VRAM
    vram_b = vram_bar(latest_vram_used, latest_vram_total)
    print(f"  {BOLD}VRAM:{RESET}  {latest_vram_used:.2f}/{latest_vram_total:.1f}GB  {vram_b}")

    # Progress
    elapsed_min = elapsed_s / 60
    print(f"\n  {BOLD}Step:{RESET}    {current_step}")
    print(f"  {BOLD}Epoch:{RESET}   {current_epoch:.2f}")
    print(f"  {BOLD}Elapsed:{RESET} {elapsed_min:.1f} min")
    print(f"  {BOLD}LR:{RESET}      {learning_rate:.2e}")

    # Mini sparkline of loss history
    if recent_losses:
        print(f"\n  {BOLD}Loss trend (last {len(recent_losses)} steps):{RESET}")
        chars = "▁▂▃▄▅▆▇█"
        if max(recent_losses) > min(recent_losses):
            rng = max(recent_losses) - min(recent_losses)
            sparkline = "".join(
                chars[min(7, int((l - min(recent_losses)) / rng * 7))]
                for l in recent_losses
            )
        else:
            sparkline = "─" * len(recent_losses)
        print(f"  {CYAN}{sparkline}{RESET}")

    # Epoch completions
    if epoch_events:
        print(f"\n  Epochs complete: {len(epoch_events)}")

    print(f"\n  {YELLOW}Refreshing every 3 seconds... (Ctrl+C to exit){RESET}")


def main():
    parser = argparse.ArgumentParser(description="Antgravity Training Monitor")
    parser.add_argument("--log",      default=None, help="Path to JSONL log file")
    parser.add_argument("--log-dir",  default="training/logs")
    parser.add_argument("--interval", type=float, default=3.0, help="Refresh interval in seconds")
    args = parser.parse_args()

    log_path = args.log

    if not log_path:
        log_path = find_latest_log(args.log_dir)
        if not log_path:
            print(f"{YELLOW}Waiting for training to start... (watching {args.log_dir}){RESET}")
            while not log_path:
                time.sleep(2)
                log_path = find_latest_log(args.log_dir)

    print(f"Monitoring: {log_path}")
    time.sleep(1)

    try:
        while True:
            events = read_events(log_path)
            render_dashboard(events, log_path)

            # Stop if training complete
            if any(e.get("event") == "training_complete" for e in events):
                print(f"\n  {GREEN}Training finished. Exiting monitor.{RESET}")
                break

            time.sleep(args.interval)
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Monitor stopped.{RESET}")


if __name__ == "__main__":
    main()
