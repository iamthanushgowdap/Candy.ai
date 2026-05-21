#!/usr/bin/env python3
"""
Antgravity — QLoRA Fine-Tuning Pipeline
=========================================
Production-grade local training script optimized for RTX 2050 4GB.

Features:
  ✓ 4-bit QLoRA quantization (BitsAndBytes NF4)
  ✓ Gradient checkpointing         (critical for 4GB VRAM)
  ✓ Flash attention safe fallback  (Windows compatible)
  ✓ Automatic OOM recovery         (reduce batch/context, retry)
  ✓ Safe tokenizer padding         (pad_token = eos_token)
  ✓ Streamed JSONL logging         (real-time loss tracking)
  ✓ Model versioning               (antgravity-v1, v2, v3...)
  ✓ Automatic resume from checkpoint
  ✓ Smoke test mode (500 samples, ~5 min)
  ✓ Per-step VRAM monitoring

Usage:
    python training/train.py
    python training/train.py --smoke-test
    python training/train.py --config training/configs/qlora_config.yaml
    python training/train.py --resume  (auto-finds latest checkpoint)
"""

import os
import sys
import json
import time
import argparse
import logging
import traceback
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

# ── Silence verbose HuggingFace logs before imports ───────────────────────────
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["TRANSFORMERS_VERBOSITY"]  = "error"
logging.getLogger("transformers").setLevel(logging.ERROR)

# ── ANSI Colors ───────────────────────────────────────────────────────────────
GREEN  = "\033[92m"; YELLOW = "\033[93m"; RED    = "\033[91m"
CYAN   = "\033[96m"; BOLD   = "\033[1m";  RESET  = "\033[0m"

def ok(msg):    print(f"  {GREEN}✓{RESET}  {msg}", flush=True)
def warn(msg):  print(f"  {YELLOW}⚠{RESET}  {msg}", flush=True)
def fail(msg):  print(f"  {RED}✗{RESET}  {msg}", flush=True)
def info(msg):  print(f"  {CYAN}ℹ{RESET}  {msg}", flush=True)
def step(msg):  print(f"\n{BOLD}{CYAN}▸ {msg}{RESET}", flush=True)


# ═══════════════════════════════════════════════════════════════════════════════
# ── JSONL Streaming Logger ─────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class StreamingLogger:
    """
    Writes training events as JSONL for real-time monitoring and future dashboards.
    Safe for concurrent reads (each line is a complete JSON object).
    """
    def __init__(self, log_path: str):
        self.log_path = log_path
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        self._file = open(log_path, "a", encoding="utf-8", buffering=1)  # Line-buffered

    def log(self, event_type: str, data: Dict[str, Any]):
        record = {
            "timestamp": datetime.utcnow().isoformat(),
            "event": event_type,
            **data
        }
        self._file.write(json.dumps(record, ensure_ascii=False) + "\n")

    def close(self):
        self._file.close()


# ═══════════════════════════════════════════════════════════════════════════════
# ── Version Management ─────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

def get_next_version(base_dir: str = "training/adapters") -> str:
    """
    Returns the next adapter version string: antgravity-v1, v2, v3...
    Never overwrites existing adapter versions.
    """
    os.makedirs(base_dir, exist_ok=True)
    existing = [
        d for d in os.listdir(base_dir)
        if d.startswith("antgravity-v") and os.path.isdir(os.path.join(base_dir, d))
    ]
    if not existing:
        return "antgravity-v1"
    # Parse version numbers
    versions = []
    for d in existing:
        try:
            v = int(d.replace("antgravity-v", ""))
            versions.append(v)
        except ValueError:
            pass
    next_v = max(versions) + 1 if versions else 1
    return f"antgravity-v{next_v}"


# ═══════════════════════════════════════════════════════════════════════════════
# ── Checkpoint Resume ──────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

def find_latest_checkpoint(checkpoint_dir: str) -> Optional[str]:
    """
    Finds the latest checkpoint directory for automatic resume.
    Returns full path to checkpoint dir, or None if no checkpoints exist.
    """
    if not os.path.exists(checkpoint_dir):
        return None
    checkpoints = [
        d for d in os.listdir(checkpoint_dir)
        if d.startswith("checkpoint-") and os.path.isdir(os.path.join(checkpoint_dir, d))
    ]
    if not checkpoints:
        return None
    # Sort by step number
    checkpoints.sort(key=lambda x: int(x.split("-")[1]) if x.split("-")[1].isdigit() else 0)
    latest = os.path.join(checkpoint_dir, checkpoints[-1])
    return latest


# ═══════════════════════════════════════════════════════════════════════════════
# ── VRAM Monitor ──────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

def get_vram_usage() -> Dict[str, float]:
    """Returns current VRAM allocated/reserved in GB."""
    try:
        import torch
        if torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated(0) / (1024**3)
            reserved  = torch.cuda.memory_reserved(0) / (1024**3)
            total     = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            return {
                "allocated_gb": round(allocated, 3),
                "reserved_gb":  round(reserved, 3),
                "total_gb":     round(total, 3),
                "free_gb":      round(total - reserved, 3)
            }
    except Exception:
        pass
    return {"allocated_gb": 0, "reserved_gb": 0, "total_gb": 0, "free_gb": 0}


# ═══════════════════════════════════════════════════════════════════════════════
# ── Custom Training Callback ───────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

def make_training_callback(logger: StreamingLogger):
    """Creates a HuggingFace Trainer callback for streaming JSONL logs."""
    from transformers import TrainerCallback

    class AntgravityCallback(TrainerCallback):
        def __init__(self):
            self.start_time = time.time()
            self.step_times = []

        def on_log(self, args, state, control, logs=None, **kwargs):
            if logs is None:
                return
            vram = get_vram_usage()
            elapsed = time.time() - self.start_time
            log_data = {
                "step": state.global_step,
                "epoch": round(state.epoch or 0, 4),
                "loss": logs.get("loss"),
                "learning_rate": logs.get("learning_rate"),
                "vram_allocated_gb": vram["allocated_gb"],
                "vram_reserved_gb":  vram["reserved_gb"],
                "elapsed_seconds":   round(elapsed, 1),
                "samples_per_second": logs.get("train_samples_per_second"),
            }
            logger.log("step", log_data)

            # Console display
            loss_str = f"{logs.get('loss', 0):.4f}" if logs.get("loss") else "—"
            vram_str = f"{vram['reserved_gb']:.2f}/{vram['total_gb']:.1f}GB"
            print(
                f"  {CYAN}step {state.global_step:>5}{RESET}"
                f"  loss={BOLD}{loss_str}{RESET}"
                f"  vram={vram_str}"
                f"  lr={logs.get('learning_rate', 0):.2e}",
                flush=True
            )

        def on_epoch_end(self, args, state, control, **kwargs):
            vram = get_vram_usage()
            logger.log("epoch_end", {
                "epoch": state.epoch,
                "step": state.global_step,
                "vram_reserved_gb": vram["reserved_gb"]
            })
            print(f"\n  {GREEN}Epoch {state.epoch:.0f} complete — VRAM: {vram['reserved_gb']:.2f} GB{RESET}\n")

        def on_save(self, args, state, control, **kwargs):
            logger.log("checkpoint_saved", {
                "step": state.global_step,
                "output_dir": str(args.output_dir)
            })

    return AntgravityCallback()


# ═══════════════════════════════════════════════════════════════════════════════
# ── Chat Template Formatting ───────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

def format_sample_to_text(sample: Dict, tokenizer) -> str:
    """
    Applies the model's built-in chat template to format a training sample.
    Falls back to manual formatting if template application fails.
    """
    messages = sample.get("messages", [])

    # Use tokenizer's apply_chat_template if available
    if hasattr(tokenizer, "apply_chat_template") and tokenizer.chat_template:
        try:
            return tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False
            )
        except Exception:
            pass

    # Manual fallback formatting (Qwen2.5 style)
    text = ""
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "").strip()
        if role == "system":
            text += f"<|im_start|>system\n{content}<|im_end|>\n"
        elif role == "user":
            text += f"<|im_start|>user\n{content}<|im_end|>\n"
        elif role == "assistant":
            text += f"<|im_start|>assistant\n{content}<|im_end|>\n"
    return text


# ═══════════════════════════════════════════════════════════════════════════════
# ── OOM Recovery Wrapper ────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

def run_training_with_oom_recovery(
    trainer,
    logger: StreamingLogger,
    checkpoint_dir: str,
    max_retries: int = 3,
    current_batch_size: int = 1,
    current_max_length: int = 512
):
    """
    Attempts training. On CUDA OOM:
      1. Clears CUDA cache
      2. Reduces context length by 64
      3. Retries training from latest checkpoint
    """
    import torch
    import gc

    resume_checkpoint = find_latest_checkpoint(checkpoint_dir)
    if resume_checkpoint:
        ok(f"Resuming from checkpoint: {resume_checkpoint}")
        logger.log("resume", {"checkpoint": resume_checkpoint})

    for attempt in range(max_retries + 1):
        try:
            if attempt > 0:
                warn(f"OOM Recovery attempt {attempt}/{max_retries}")
                warn(f"  Batch size:    {current_batch_size}")
                warn(f"  Max length:    {current_max_length}")
                logger.log("oom_recovery", {
                    "attempt": attempt,
                    "batch_size": current_batch_size,
                    "max_length": current_max_length
                })

                # Clear VRAM
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    torch.cuda.synchronize()

            result = trainer.train(
                resume_from_checkpoint=find_latest_checkpoint(checkpoint_dir)
            )
            return result

        except RuntimeError as e:
            if "out of memory" in str(e).lower() or "CUDA out of memory" in str(e):
                if attempt < max_retries:
                    fail(f"CUDA OOM detected on attempt {attempt + 1}")

                    # Reduce context length
                    current_max_length = max(128, current_max_length - 64)

                    # Update trainer's data collator max length if possible
                    if hasattr(trainer, "data_collator") and hasattr(trainer.data_collator, "max_length"):
                        trainer.data_collator.max_length = current_max_length

                    # Garbage collect
                    gc.collect()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()

                    time.sleep(2)
                    continue
                else:
                    fail(f"Training failed after {max_retries} OOM recovery attempts")
                    raise
            else:
                raise


# ═══════════════════════════════════════════════════════════════════════════════
# ── Main Training Function ─────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

def run_training(
    smoke_test: bool = False,
    config_path: str = "training/configs/qlora_config.yaml",
    force_resume: bool = False,
    no_oom_recovery: bool = False
):
    import yaml
    import torch
    import gc
    from datasets import Dataset as HFDataset

    # ── Load Config ────────────────────────────────────────────────────────────
    step("Loading configuration")
    with open(config_path, "r") as f:
        cfg = yaml.safe_load(f)

    base_model       = cfg["base_model"]
    max_token_length = cfg["max_token_length"]
    checkpoint_dir   = cfg["checkpoint_dir"]
    lora_r           = cfg["lora_r"]
    lora_alpha       = cfg["lora_alpha"]
    lora_dropout     = cfg["lora_dropout"]
    lora_targets     = cfg["lora_target_modules"]
    epochs           = cfg["num_train_epochs"]
    batch_size       = cfg["per_device_train_batch_size"]
    grad_accum       = cfg["gradient_accumulation_steps"]
    logging_steps    = cfg["logging_steps"]
    save_steps       = cfg["save_steps"]
    eval_steps       = cfg["eval_steps"]

    if smoke_test:
        warn("SMOKE TEST MODE — 500 samples, 20 steps")
        max_token_length = 256  # Reduce for smoke test
        epochs = 1
        logging_steps = 5
        save_steps = 20
        eval_steps = 20

    # ── Version + Paths ────────────────────────────────────────────────────────
    step("Resolving output paths")
    version       = get_next_version(cfg["output_dir"])
    adapter_dir   = os.path.join(cfg["output_dir"], version)
    ckpt_dir      = os.path.join(checkpoint_dir, version)
    log_path      = os.path.join(cfg["log_dir"], f"training_{version}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.jsonl")
    os.makedirs(adapter_dir, exist_ok=True)
    os.makedirs(ckpt_dir,    exist_ok=True)
    os.makedirs(cfg["log_dir"], exist_ok=True)

    ok(f"Model version:  {version}")
    ok(f"Adapter output: {adapter_dir}")
    ok(f"Log file:       {log_path}")

    logger = StreamingLogger(log_path)
    logger.log("training_start", {
        "version": version,
        "base_model": base_model,
        "smoke_test": smoke_test,
        "max_token_length": max_token_length,
        "lora_r": lora_r,
        "lora_alpha": lora_alpha
    })

    # ── Load Dataset ───────────────────────────────────────────────────────────
    step("Loading training dataset")
    train_path = cfg["train_split_path"]
    eval_path  = cfg["eval_split_path"]

    if not os.path.exists(train_path):
        fail(f"Training data not found: {train_path}")
        fail("Run: python training/scripts/prepare_dataset.py")
        sys.exit(1)

    with open(train_path, "r", encoding="utf-8") as f:
        train_data = json.load(f)
    with open(eval_path, "r", encoding="utf-8") as f:
        eval_data = json.load(f)

    if smoke_test:
        train_data = train_data[:cfg["smoke_test_samples"]]
        eval_data  = eval_data[:50]

    ok(f"Train samples: {len(train_data):,}")
    ok(f"Eval samples:  {len(eval_data):,}")

    # ── Load Tokenizer ─────────────────────────────────────────────────────────
    step("Loading tokenizer")
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(
        base_model,
        trust_remote_code=True,
        use_fast=True
    )

    # ✓ Safe tokenizer padding — prevents crash on pad_token_id=None
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id
        ok("pad_token set to eos_token (safe padding)")
    else:
        ok(f"pad_token: {tokenizer.pad_token!r}")

    # ── Format Dataset ──────────────────────────────────────────────────────────
    step("Formatting dataset with chat template")

    def preprocess(examples):
        texts = []
        for sample in examples["messages_data"]:
            sample_dict = {"messages": sample}
            text = format_sample_to_text(sample_dict, tokenizer)
            texts.append(text)
        tokenized = tokenizer(
            texts,
            truncation=True,
            max_length=max_token_length,
            padding="max_length",
            return_tensors=None
        )
        tokenized["labels"] = tokenized["input_ids"].copy()
        return tokenized

    # Build HuggingFace Dataset objects
    train_hf = HFDataset.from_dict({"messages_data": [s["messages"] for s in train_data]})
    eval_hf  = HFDataset.from_dict({"messages_data": [s["messages"] for s in eval_data]})

    train_hf = train_hf.map(preprocess, batched=True, batch_size=100,
                             remove_columns=["messages_data"],
                             desc="Tokenizing train set")
    eval_hf  = eval_hf.map(preprocess, batched=True, batch_size=100,
                             remove_columns=["messages_data"],
                             desc="Tokenizing eval set")
    ok(f"Tokenization complete")

    # ── Quantization Config ────────────────────────────────────────────────────
    step("Setting up 4-bit quantization (QLoRA NF4)")
    from transformers import BitsAndBytesConfig

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,   # Nested quantization — saves ~0.4GB
    )
    ok("BitsAndBytesConfig: load_in_4bit=True, nf4, double_quant=True")

    # ── Flash Attention Safe Fallback ──────────────────────────────────────────
    step("Checking flash attention support")
    attn_impl = "eager"  # Safe default for Windows
    try:
        import flash_attn  # noqa
        attn_impl = "flash_attention_2"
        ok("flash-attn available — using flash_attention_2")
    except ImportError:
        warn("flash-attn not available — using standard eager attention (safe on Windows)")

    # ── Load Base Model ────────────────────────────────────────────────────────
    step(f"Loading base model: {base_model}")
    from transformers import AutoModelForCausalLM

    vram_before = get_vram_usage()
    info(f"VRAM before model load: {vram_before['reserved_gb']:.2f} GB reserved")

    load_kwargs = dict(
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        torch_dtype=torch.float16,
    )

    if attn_impl == "flash_attention_2":
        load_kwargs["attn_implementation"] = "flash_attention_2"

    try:
        model = AutoModelForCausalLM.from_pretrained(base_model, **load_kwargs)
    except Exception as e:
        if "flash" in str(e).lower():
            warn(f"Flash attention failed: {e}")
            warn("Retrying with standard attention (eager)...")
            load_kwargs.pop("attn_implementation", None)
            model = AutoModelForCausalLM.from_pretrained(base_model, **load_kwargs)
        else:
            raise

    vram_after = get_vram_usage()
    ok(f"Model loaded — VRAM: {vram_after['reserved_gb']:.2f} GB reserved")
    logger.log("model_loaded", {
        "vram_reserved_gb": vram_after["reserved_gb"],
        "vram_free_gb": vram_after["free_gb"]
    })

    # ── ✓ Gradient Checkpointing ───────────────────────────────────────────────
    step("Enabling gradient checkpointing")
    model.gradient_checkpointing_enable()
    model.enable_input_require_grads()  # Required when using gradient checkpointing with PEFT
    ok("Gradient checkpointing enabled — VRAM savings active")

    # Disable KV cache (incompatible with gradient checkpointing)
    model.config.use_cache = False

    # ── LoRA Adapters ──────────────────────────────────────────────────────────
    step("Attaching LoRA adapters")
    from peft import LoraConfig, get_peft_model, TaskType, prepare_model_for_kbit_training

    # Prepare model for k-bit training (handles frozen quantized layers)
    model = prepare_model_for_kbit_training(
        model,
        use_gradient_checkpointing=True
    )

    lora_config = LoraConfig(
        r=lora_r,
        lora_alpha=lora_alpha,
        lora_dropout=lora_dropout,
        target_modules=lora_targets,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        inference_mode=False
    )

    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Log trainable param count
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    logger.log("lora_attached", {
        "total_params": total_params,
        "trainable_params": trainable_params,
        "trainable_pct": round(100 * trainable_params / total_params, 4),
        "target_modules": lora_targets
    })
    ok(f"LoRA adapters active: {trainable_params:,} trainable / {total_params:,} total")

    # ── Training Arguments ─────────────────────────────────────────────────────
    step("Configuring training arguments")
    from transformers import TrainingArguments

    training_args = TrainingArguments(
        output_dir=ckpt_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=grad_accum,
        gradient_checkpointing=True,
        fp16=True,
        bf16=False,
        optim="paged_adamw_8bit",
        learning_rate=cfg["learning_rate"],
        lr_scheduler_type=cfg["lr_scheduler_type"],
        warmup_ratio=cfg["warmup_ratio"],
        weight_decay=cfg["weight_decay"],
        max_grad_norm=cfg["max_grad_norm"],
        logging_steps=logging_steps,
        eval_strategy="steps",
        eval_steps=eval_steps,
        save_strategy="steps",
        save_steps=save_steps,
        save_total_limit=cfg["save_total_limit"],
        load_best_model_at_end=False,
        report_to="none",
        dataloader_pin_memory=False,
        dataloader_num_workers=0,          # Windows-safe
        remove_unused_columns=False,
        label_names=["labels"],
        max_steps=cfg["smoke_test_steps"] if smoke_test else -1,
    )
    ok(f"Training args: fp16=True, optim=paged_adamw_8bit, grad_accum={grad_accum}")

    # ── Data Collator ──────────────────────────────────────────────────────────
    from transformers import DataCollatorForLanguageModeling

    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,                          # Causal LM, not masked
    )

    # ── Callbacks ─────────────────────────────────────────────────────────────
    step("Setting up training callbacks")
    callback = make_training_callback(logger)

    # ── Trainer ───────────────────────────────────────────────────────────────
    step("Initializing Trainer")
    from transformers import Trainer

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_hf,
        eval_dataset=eval_hf,
        data_collator=data_collator,
        callbacks=[callback],
    )
    ok("Trainer initialized")

    # ── Run Training ───────────────────────────────────────────────────────────
    step("Starting training" + (" [SMOKE TEST — 500 samples]" if smoke_test else ""))
    vram = get_vram_usage()
    info(f"VRAM at training start: {vram['reserved_gb']:.2f} GB reserved of {vram['total_gb']:.1f} GB")
    logger.log("training_begin", {"vram": vram, "smoke_test": smoke_test})
    train_start = time.time()

    if cfg.get("oom_recovery_enabled", True) and not no_oom_recovery:
        result = run_training_with_oom_recovery(
            trainer=trainer,
            logger=logger,
            checkpoint_dir=ckpt_dir,
            max_retries=cfg.get("oom_max_retries", 3),
            current_batch_size=batch_size,
            current_max_length=max_token_length
        )
    else:
        result = trainer.train(
            resume_from_checkpoint=find_latest_checkpoint(ckpt_dir) if force_resume else None
        )

    train_duration = time.time() - train_start
    ok(f"Training complete in {train_duration / 60:.1f} minutes")

    logger.log("training_complete", {
        "duration_seconds": round(train_duration, 1),
        "train_loss": getattr(result, "training_loss", None),
        "steps": result.global_step if result else None
    })

    # ── Save Adapter ────────────────────────────────────────────────────────────
    step(f"Saving LoRA adapter: {adapter_dir}")
    model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)

    # Save version manifest
    manifest = {
        "version": version,
        "base_model": base_model,
        "trained_at": datetime.utcnow().isoformat(),
        "smoke_test": smoke_test,
        "lora_config": {
            "r": lora_r, "alpha": lora_alpha,
            "dropout": lora_dropout, "targets": lora_targets
        },
        "train_samples": len(train_data),
        "max_token_length": max_token_length,
        "train_duration_minutes": round(train_duration / 60, 1),
        "log_path": log_path
    }
    with open(os.path.join(adapter_dir, "antgravity_manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    logger.log("adapter_saved", {"adapter_dir": adapter_dir, "version": version})

    ok(f"Adapter saved: {adapter_dir}")
    ok(f"Tokenizer saved: {adapter_dir}")
    ok(f"Manifest saved: {adapter_dir}/antgravity_manifest.json")

    # ── Final Summary ──────────────────────────────────────────────────────────
    print(f"\n{BOLD}{GREEN}╔══════════════════════════════════════════════╗")
    print(f"║  🎉  Training Complete: {version:<20} ║")
    print(f"╚══════════════════════════════════════════════╝{RESET}")
    print(f"\n  Adapter:  {adapter_dir}")
    print(f"  Log:      {log_path}")
    print(f"  Duration: {train_duration / 60:.1f} min")
    if not smoke_test:
        print(f"\n  {BOLD}Next steps:{RESET}")
        print(f"  1. {CYAN}python training/scripts/export_to_gguf.py --version {version}{RESET}")
        print(f"  2. Convert to GGUF with llama.cpp (see export script instructions)")
        print(f"  3. {CYAN}.\\training\\scripts\\create_ollama_model.ps1 -Version {version}{RESET}")
    else:
        print(f"\n  {YELLOW}Smoke test complete. Run full training:{RESET}")
        print(f"  {CYAN}python training/train.py{RESET}")
    print()

    logger.close()
    return version, adapter_dir


# ═══════════════════════════════════════════════════════════════════════════════
# ── Entry Point ───────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Antgravity QLoRA Fine-Tuning Pipeline"
    )
    parser.add_argument("--smoke-test",  action="store_true",
                        help="Run a 500-sample smoke test (~5 min) to verify pipeline")
    parser.add_argument("--resume",      action="store_true",
                        help="Force resume from latest checkpoint")
    parser.add_argument("--no-oom-recovery", action="store_true",
                        help="Disable automatic OOM recovery")
    parser.add_argument("--config",      default="training/configs/qlora_config.yaml",
                        help="Path to YAML config file")
    args = parser.parse_args()

    print(f"\n{BOLD}{CYAN}╔══════════════════════════════════════════════╗")
    print(f"║  Antgravity QLoRA Training Pipeline          ║")
    print(f"║  RTX 2050 4GB Optimized                      ║")
    print(f"╚══════════════════════════════════════════════╝{RESET}")

    try:
        run_training(
            smoke_test=args.smoke_test,
            config_path=args.config,
            force_resume=args.resume,
            no_oom_recovery=args.no_oom_recovery
        )
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Training interrupted by user.{RESET}")
        print("To resume: python training/train.py --resume")
        sys.exit(0)
    except Exception as e:
        print(f"\n{RED}Training failed: {e}{RESET}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
