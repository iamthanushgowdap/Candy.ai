#!/usr/bin/env python3
"""
Antgravity — Pre-flight Environment Check
==========================================
Run this BEFORE training to verify all dependencies, CUDA availability,
bitsandbytes compatibility, and VRAM sufficiency.

Usage:
    python training/scripts/check_environment.py
"""

import sys
import os
import importlib
import subprocess

# ── ANSI Colors ───────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):    print(f"  {GREEN}✓{RESET}  {msg}")
def warn(msg):  print(f"  {YELLOW}⚠{RESET}  {msg}")
def fail(msg):  print(f"  {RED}✗{RESET}  {msg}")
def info(msg):  print(f"  {CYAN}ℹ{RESET}  {msg}")

REQUIRED_PACKAGES = [
    "torch", "transformers", "peft", "trl", "accelerate",
    "datasets", "bitsandbytes", "sentencepiece", "scipy"
]

OPTIONAL_PACKAGES = ["flash_attn", "xformers"]


def check_python():
    print(f"\n{BOLD}── Python ────────────────────────────────────────────{RESET}")
    ver = sys.version_info
    if ver.major == 3 and ver.minor >= 10:
        ok(f"Python {ver.major}.{ver.minor}.{ver.micro}")
    else:
        fail(f"Python {ver.major}.{ver.minor} — need 3.10+")


def check_cuda():
    print(f"\n{BOLD}── CUDA / GPU ────────────────────────────────────────{RESET}")
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            vram_total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            vram_free  = (torch.cuda.get_device_properties(0).total_memory
                          - torch.cuda.memory_reserved(0)) / (1024**3)
            ok(f"CUDA available — {gpu_name}")
            ok(f"VRAM: {vram_total:.1f} GB total, {vram_free:.1f} GB free")
            if vram_total < 3.5:
                warn(f"Only {vram_total:.1f} GB VRAM — training may OOM. Reduce max_token_length.")
            info(f"CUDA version: {torch.version.cuda}")
            info(f"PyTorch version: {torch.__version__}")
        else:
            fail("CUDA not available — training will run on CPU (very slow)")
    except ImportError:
        fail("PyTorch not installed")


def check_packages():
    print(f"\n{BOLD}── Required Packages ─────────────────────────────────{RESET}")
    missing = []
    for pkg in REQUIRED_PACKAGES:
        try:
            mod = importlib.import_module(pkg)
            ver = getattr(mod, "__version__", "unknown")
            ok(f"{pkg} ({ver})")
        except ImportError:
            fail(f"{pkg} — NOT INSTALLED")
            missing.append(pkg)

    print(f"\n{BOLD}── Optional Packages ─────────────────────────────────{RESET}")
    for pkg in OPTIONAL_PACKAGES:
        try:
            mod = importlib.import_module(pkg)
            ver = getattr(mod, "__version__", "unknown")
            ok(f"{pkg} ({ver}) — available")
        except ImportError:
            warn(f"{pkg} — not installed (safe to skip on Windows)")

    return missing


def check_bitsandbytes():
    print(f"\n{BOLD}── bitsandbytes CUDA Support ─────────────────────────{RESET}")
    try:
        import bitsandbytes as bnb
        ok(f"bitsandbytes {bnb.__version__} imported")
        try:
            import bitsandbytes.cuda_setup.main
            ok("CUDA setup module found")
        except Exception:
            warn("CUDA setup module not found — may fall back to CPU quantization")

        # Quick functional test
        try:
            import torch
            if torch.cuda.is_available():
                test = bnb.nn.Linear8bitLt(16, 16, has_fp16_weights=False)
                ok("8-bit linear layer instantiation: OK")
        except Exception as e:
            warn(f"8-bit test failed: {e} — will use CPU offload fallback")
    except ImportError:
        fail("bitsandbytes not installed")
        info("Install: pip install bitsandbytes")
        info("Windows alt: pip install bitsandbytes --extra-index-url https://jllllll.github.io/bitsandbytes-windows-webui")


def check_dataset():
    print(f"\n{BOLD}── Dataset ───────────────────────────────────────────{RESET}")
    dataset_path = "datasets/final_training_dataset.json"
    if os.path.exists(dataset_path):
        size_mb = os.path.getsize(dataset_path) / (1024 * 1024)
        ok(f"Found: {dataset_path} ({size_mb:.1f} MB)")
        # Quick format check
        try:
            import json
            with open(dataset_path, "r", encoding="utf-8") as f:
                sample = json.load(f)
            if isinstance(sample, list) and len(sample) > 0:
                first = sample[0]
                if "messages" in first and isinstance(first["messages"], list):
                    ok(f"Format: valid — {len(sample):,} total samples")
                else:
                    fail("Format: unexpected structure — expected {messages: [...]}")
            else:
                fail("Format: empty or invalid JSON array")
        except Exception as e:
            fail(f"Failed to parse dataset: {e}")
    else:
        fail(f"Dataset not found: {dataset_path}")


def check_huggingface():
    print(f"\n{BOLD}── HuggingFace Cache ─────────────────────────────────{RESET}")
    hf_cache = os.path.expanduser("~/.cache/huggingface/hub")
    if os.path.exists(hf_cache):
        # Check if Qwen2.5-3B is already cached
        qwen_cached = any(
            "Qwen2.5-3B" in d or "qwen2.5-3b" in d.lower()
            for d in os.listdir(hf_cache)
            if os.path.isdir(os.path.join(hf_cache, d))
        )
        if qwen_cached:
            ok("Qwen/Qwen2.5-3B-Instruct already cached — no download needed!")
        else:
            warn("Qwen/Qwen2.5-3B-Instruct NOT cached — first run will download ~6GB")
            info("This download happens ONCE and is cached permanently")
    else:
        warn("HuggingFace cache dir not found — first run will download ~6GB")


def check_disk():
    print(f"\n{BOLD}── Disk Space ────────────────────────────────────────{RESET}")
    import shutil
    total, used, free = shutil.disk_usage(".")
    free_gb = free / (1024**3)
    if free_gb > 20:
        ok(f"Free disk space: {free_gb:.1f} GB")
    elif free_gb > 10:
        warn(f"Free disk space: {free_gb:.1f} GB — will be tight with model weights")
    else:
        fail(f"Only {free_gb:.1f} GB free — need at least 15GB for training")


def main():
    print(f"\n{BOLD}{CYAN}╔══════════════════════════════════════════╗")
    print(f"║  Antgravity Pre-flight Environment Check  ║")
    print(f"╚══════════════════════════════════════════╝{RESET}")

    check_python()
    check_cuda()
    missing = check_packages()
    check_bitsandbytes()
    check_dataset()
    check_huggingface()
    check_disk()

    print(f"\n{BOLD}── Summary ───────────────────────────────────────────{RESET}")
    if missing:
        fail(f"Missing packages: {', '.join(missing)}")
        print(f"\n  Install with:")
        print(f"  {CYAN}pip install {' '.join(missing)}{RESET}")
        sys.exit(1)
    else:
        ok("All required packages installed")
        ok("System ready for training")
        print(f"\n  {BOLD}Next step:{RESET}")
        print(f"  {CYAN}python training/scripts/prepare_dataset.py{RESET}")
        print()


if __name__ == "__main__":
    main()
