# Antgravity Ollama Model Creator
# ===================================
# Creates the Ollama model from a trained GGUF adapter.
#
# Usage:
#   .\training\scripts\create_ollama_model.ps1
#   .\training\scripts\create_ollama_model.ps1 -Version antgravity-v1
#   .\training\scripts\create_ollama_model.ps1 -Version antgravity-v2 -ModelName antgravity-v2

param(
    [string]$Version   = "",
    [string]$ModelName = "antgravity",
    [string]$ExportsDir = "training\exports",
    [switch]$Test
)

$ErrorActionPreference = "Stop"

# ── ANSI colors ────────────────────────────────────────────────────────────────
function Write-Ok($msg)   { Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!!]  $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  [XX]  $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  [>>]  $msg" -ForegroundColor Cyan }
function Write-Step($msg) { Write-Host "`n  == $msg ==" -ForegroundColor Cyan }

Write-Host "`n  Antgravity — Ollama Model Creator" -ForegroundColor Cyan
Write-Host "  ===================================" -ForegroundColor Cyan

# ── Find GGUF file ─────────────────────────────────────────────────────────────
Write-Step "Locating GGUF file"

if ($Version -eq "") {
    # Auto-detect latest version
    $ggufFiles = Get-ChildItem -Path $ExportsDir -Filter "antgravity-v*.Q4_K_M.gguf" -ErrorAction SilentlyContinue |
                 Sort-Object Name |
                 Select-Object -Last 1
    if (-not $ggufFiles) {
        Write-Fail "No GGUF files found in $ExportsDir"
        Write-Info "Run: python training\scripts\export_to_gguf.py"
        exit 1
    }
    $GgufPath = $ggufFiles.FullName
    $Version  = $ggufFiles.BaseName -replace "\.Q4_K_M$", ""
} else {
    $GgufPath = Join-Path $ExportsDir "$Version.Q4_K_M.gguf"
    if (-not (Test-Path $GgufPath)) {
        Write-Fail "GGUF not found: $GgufPath"
        Write-Info "Run: python training\scripts\export_to_gguf.py --version $Version"
        exit 1
    }
}

Write-Ok "GGUF file: $GgufPath"
Write-Ok "Version:   $Version"
Write-Ok "Model name: $ModelName"

# ── Generate Modelfile ─────────────────────────────────────────────────────────
Write-Step "Generating Modelfile"

$ModelfilePath = Join-Path $ExportsDir "Modelfile_$Version"
$ModelfileContent = @"
FROM $GgufPath

PARAMETER temperature 0.72
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096
PARAMETER num_predict 512
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|im_start|>"

SYSTEM """
You are Antgravity, a premium conversational AI assistant built on a specialized fine-tuned intelligence layer.
You are direct, thoughtful, technically capable, and conversationally natural.
You maintain context across long conversations, recall prior details, and always deliver high-quality responses.
You excel at code generation, reasoning, creative writing, and deep technical analysis.
Never add unnecessary caveats or filler phrases. Be precise and genuinely helpful.
"""
"@

$ModelfileContent | Set-Content -Path $ModelfilePath -Encoding UTF8
Write-Ok "Modelfile written: $ModelfilePath"

# ── Check Ollama ───────────────────────────────────────────────────────────────
Write-Step "Checking Ollama"
try {
    $ollamaVersion = & ollama --version 2>&1
    Write-Ok "Ollama found: $ollamaVersion"
} catch {
    Write-Fail "Ollama not found or not running"
    Write-Info "Install from: https://ollama.com/download"
    exit 1
}

# ── Create Ollama Model ────────────────────────────────────────────────────────
Write-Step "Creating Ollama model: $ModelName"
Write-Info "This may take a minute while Ollama indexes the GGUF..."

try {
    & ollama create $ModelName -f $ModelfilePath
    Write-Ok "Model created: $ModelName"
} catch {
    Write-Fail "Failed to create Ollama model: $_"
    exit 1
}

# ── Verify ────────────────────────────────────────────────────────────────────
Write-Step "Verifying model in Ollama list"
$models = & ollama list 2>&1
if ($models -match $ModelName) {
    Write-Ok "$ModelName is registered in Ollama"
} else {
    Write-Warn "$ModelName not found in ollama list — creation may have failed"
}

# ── Test ──────────────────────────────────────────────────────────────────────
if ($Test) {
    Write-Step "Running quick inference test"
    Write-Info "Prompt: 'Hello, who are you?'"
    & ollama run $ModelName "Hello, who are you?" --nowordwrap
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host "`n  Model ready!" -ForegroundColor Green
Write-Host "  Run: ollama run $ModelName" -ForegroundColor Cyan
Write-Host "  Or start Antgravity and the router will auto-detect it.`n"
