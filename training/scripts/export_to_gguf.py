#!/usr/bin/env python3
"""
Antgravity — LoRA Adapter Export to GGUF
==========================================
Merges the trained LoRA adapter into the base model weights,
saves a full merged model, and provides instructions for GGUF conversion
via llama.cpp for Ollama compatibility.

Usage:
    python training/scripts/export_to_gguf.py
    python training/scripts/export_to_gguf.py --version antgravity-v1
    python training/scripts/export_to_gguf.py --list
"""

import os
import sys
import json
import argparse
import subprocess
import glob
from datetime import datetime

GREEN  = "\033[92m"; YELLOW = "\033[93m"; RED    = "\033[91m"
CYAN   = "\033[96m"; BOLD   = "\033[1m";  RESET  = "\033[0m"

def ok(msg):   print(f"  {GREEN}✓{RESET}  {msg}", flush=True)
def warn(msg): print(f"  {YELLOW}⚠{RESET}  {msg}", flush=True)
def fail(msg): print(f"  {RED}✗{RESET}  {msg}", flush=True)
def info(msg): print(f"  {CYAN}ℹ{RESET}  {msg}", flush=True)
def step(msg): print(f"\n{BOLD}{CYAN}▸ {msg}{RESET}", flush=True)


def list_adapters(adapters_dir: str = "training/adapters"):
    """List all available adapter versions."""
    if not os.path.exists(adapters_dir):
        print(f"No adapters directory found: {adapters_dir}")
        return []
    adapters = [
        d for d in os.listdir(adapters_dir)
        if d.startswith("antgravity-v") and os.path.isdir(os.path.join(adapters_dir, d))
    ]
    adapters.sort()
    if not adapters:
        print(f"{YELLOW}No adapters found in {adapters_dir}{RESET}")
        print("Run training first: python training/train.py")
        return []
    print(f"\n{BOLD}Available Antgravity adapter versions:{RESET}")
    for a in adapters:
        manifest_path = os.path.join(adapters_dir, a, "antgravity_manifest.json")
        if os.path.exists(manifest_path):
            with open(manifest_path) as f:
                m = json.load(f)
            trained_at = m.get("trained_at", "unknown")[:10]
            train_mins = m.get("train_duration_minutes", "?")
            samples    = m.get("train_samples", "?")
            smoke      = " [smoke test]" if m.get("smoke_test") else ""
            print(f"  {GREEN}✓{RESET}  {BOLD}{a}{RESET} — trained {trained_at}, {samples:,} samples, {train_mins}min{smoke}")
        else:
            print(f"  {CYAN}○{RESET}  {a}")
    return adapters


def get_latest_version(adapters_dir: str = "training/adapters") -> str | None:
    adapters = [
        d for d in os.listdir(adapters_dir)
        if d.startswith("antgravity-v") and os.path.isdir(os.path.join(adapters_dir, d))
    ]
    if not adapters:
        return None
    adapters.sort(key=lambda x: int(x.replace("antgravity-v", "")) if x.replace("antgravity-v", "").isdigit() else 0)
    return adapters[-1]


def merge_adapter(version: str, base_model: str, adapters_dir: str, exports_dir: str):
    """Merge LoRA adapter weights into the base model and save full model."""
    adapter_path = os.path.join(adapters_dir, version)
    export_path  = os.path.join(exports_dir, f"{version}-merged")

    if not os.path.exists(adapter_path):
        fail(f"Adapter not found: {adapter_path}")
        sys.exit(1)

    step(f"Merging adapter {version} into base model")
    info(f"Adapter:    {adapter_path}")
    info(f"Base model: {base_model}")
    info(f"Export to:  {export_path}")

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import PeftModel

        os.makedirs(export_path, exist_ok=True)

        # Load base model in float16 (NOT quantized — need full weights for merge)
        step("Loading base model for merge (float16, no quantization)")
        base = AutoModelForCausalLM.from_pretrained(
            base_model,
            torch_dtype=torch.float16,
            device_map="cpu",           # Use CPU for merge to avoid VRAM overflow
            trust_remote_code=True
        )
        ok("Base model loaded on CPU")

        # Load LoRA adapter
        step("Loading LoRA adapter")
        model = PeftModel.from_pretrained(base, adapter_path)
        ok("LoRA adapter loaded")

        # Merge and unload
        step("Merging adapter weights (this may take ~2-3 minutes)")
        model = model.merge_and_unload()
        ok("Merge complete — adapter weights fused into base model")

        # Save merged model
        step(f"Saving merged model: {export_path}")
        model.save_pretrained(export_path, safe_serialization=True)
        ok("Merged model saved")

        # Save tokenizer
        tokenizer = AutoTokenizer.from_pretrained(adapter_path, trust_remote_code=True)
        tokenizer.save_pretrained(export_path)
        ok("Tokenizer saved")

        # Save export manifest
        manifest = {
            "version": version,
            "merged_at": datetime.utcnow().isoformat(),
            "base_model": base_model,
            "adapter_path": adapter_path,
            "export_path": export_path,
            "status": "merged_ready_for_gguf"
        }
        with open(os.path.join(export_path, "export_manifest.json"), "w") as f:
            json.dump(manifest, f, indent=2)

        return export_path

    except ImportError as e:
        fail(f"Missing package: {e}")
        fail("Install: pip install transformers peft torch")
        sys.exit(1)


def print_gguf_instructions(version: str, export_path: str, exports_dir: str):
    """Print step-by-step GGUF conversion instructions."""
    gguf_name = f"{version}.Q4_K_M.gguf"

    print(f"\n{BOLD}{CYAN}╔══════════════════════════════════════════════════════════╗")
    print(f"║  GGUF Conversion Instructions                            ║")
    print(f"╚══════════════════════════════════════════════════════════╝{RESET}")

    print(f"""
{BOLD}Step 1 — Clone llama.cpp{RESET} (if not already done):
  {CYAN}git clone https://github.com/ggerganov/llama.cpp
  cd llama.cpp
  pip install -r requirements.txt{RESET}

{BOLD}Step 2 — Convert to GGUF F16:{RESET}
  {CYAN}python llama.cpp/convert_hf_to_gguf.py \\
    {export_path} \\
    --outtype f16 \\
    --outfile training/exports/{version}.f16.gguf{RESET}

{BOLD}Step 3 — Quantize to Q4_K_M (RTX 2050 optimal):{RESET}
  {CYAN}llama.cpp/llama-quantize \\
    training/exports/{version}.f16.gguf \\
    training/exports/{gguf_name} \\
    Q4_K_M{RESET}

{BOLD}Step 4 — Create Ollama model:{RESET}
  {CYAN}.\\training\\scripts\\create_ollama_model.ps1 -Version {version}{RESET}

{BOLD}Step 5 — Test:{RESET}
  {CYAN}ollama run antgravity "Hello, who are you?"{RESET}
""")


def main():
    parser = argparse.ArgumentParser(description="Antgravity Adapter Export")
    parser.add_argument("--version",     default=None, help="Adapter version (e.g. antgravity-v1)")
    parser.add_argument("--base-model",  default="Qwen/Qwen2.5-3B-Instruct")
    parser.add_argument("--adapters-dir",default="training/adapters")
    parser.add_argument("--exports-dir", default="training/exports")
    parser.add_argument("--list",        action="store_true", help="List all adapter versions")
    parser.add_argument("--skip-merge",  action="store_true", help="Skip merge, just print GGUF instructions")
    args = parser.parse_args()

    print(f"\n{BOLD}{CYAN}╔══════════════════════════════════════╗")
    print(f"║  Antgravity — Export to GGUF         ║")
    print(f"╚══════════════════════════════════════╝{RESET}")

    if args.list:
        list_adapters(args.adapters_dir)
        return

    # Resolve version
    version = args.version
    if not version:
        version = get_latest_version(args.adapters_dir)
        if not version:
            fail("No adapter versions found. Run training first.")
            sys.exit(1)
        ok(f"Auto-selected latest version: {version}")
    else:
        ok(f"Selected version: {version}")

    export_path = os.path.join(args.exports_dir, f"{version}-merged")

    if not args.skip_merge:
        export_path = merge_adapter(
            version=version,
            base_model=args.base_model,
            adapters_dir=args.adapters_dir,
            exports_dir=args.exports_dir
        )
        ok(f"Merged model ready at: {export_path}")
    else:
        warn("Skipping merge step (--skip-merge)")

    print_gguf_instructions(version, export_path, args.exports_dir)


if __name__ == "__main__":
    main()
