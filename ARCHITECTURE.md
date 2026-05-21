# Antgravity — Complete Website Architecture

> **Project:** Candy.ai / Antgravity  
> **Stack:** Next.js 16.2.6 · React 19 · TypeScript · Tailwind CSS v4 · Supabase PostgreSQL + pgvector · Ollama · Python QLoRA  
> **Status Legend:** ✅ Implemented · 🔄 Partial · ❌ Not Yet Built

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Frontend Layer](#2-frontend-layer)
3. [API Layer](#3-api-layer)
4. [AI Engine (Core Intelligence)](#4-ai-engine-core-intelligence)
5. [Training Pipeline](#5-training-pipeline)
6. [Database Layer](#6-database-layer)
7. [Datasets](#7-datasets)
8. [Infrastructure & Config](#8-infrastructure--config)
9. [Full Feature Roadmap — Yet to Build](#9-full-feature-roadmap--yet-to-build)

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ANTGRAVITY PLATFORM                              │
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │  Next.js UI  │───▶│  API Routes  │───▶│  AI Orchestration Engine │  │
│  │  (React 19)  │    │  (Edge/Node) │    │  (28+ TypeScript modules)│  │
│  └──────────────┘    └──────────────┘    └───────────┬──────────────┘  │
│                                                      │                  │
│           ┌──────────────────────────────────────────┘                  │
│           │                                                             │
│     ┌─────▼──────┐      ┌───────────────┐     ┌──────────────────┐    │
│     │   Ollama   │      │    Supabase   │     │  Training Stack  │    │
│     │ (Local LLM)│      │  PostgreSQL + │     │  (Python QLoRA)  │    │
│     │ qwen2.5:0.5b│     │   pgvector   │     │  RTX 2050 Ready  │    │
│     └────────────┘      └───────────────┘     └──────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Layer

### Pages

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [page.tsx](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/app/page.tsx) | Main chat interface — sessions, messages, routing display, workspace |
| ✅ | [layout.tsx](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/app/layout.tsx) | Root HTML shell, font loading, metadata |
| ✅ | [globals.css](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/app/globals.css) | Global styles, Tailwind tokens, animations, premium card CSS |
| ❌ | `/settings` page | User preferences, API keys, model config UI |
| ❌ | `/training` page | Dashboard for training pipeline status |
| ❌ | `/memories` page | Browse, edit, delete all stored pgvector memories |
| ❌ | `/analytics` page | Token usage, model usage stats, conversation metrics |

### Components

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [MessageBubble.tsx](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/components/MessageBubble.tsx) | Individual chat message with copy, edit, share, thumbs up/down |
| ✅ | [MarkdownRenderer.tsx](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/components/MarkdownRenderer.tsx) | Renders markdown, code blocks with syntax highlighting, tables, math |
| ✅ | [Sidebar.tsx](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/components/Sidebar.tsx) | Session list, search, rename, delete, new chat button |
| ✅ | [LivePreviewPanel.tsx](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/components/LivePreviewPanel.tsx) | Sandboxed live code preview iframe with file tabs |
| ✅ | [LiveEditor.tsx](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/components/LiveEditor.tsx) | In-browser code editor for live sandbox files |
| ❌ | `TrainingDashboard.tsx` | Visual pipeline status, loss graphs, VRAM monitor |
| ❌ | `MemoryBrowser.tsx` | Browse and manage all pgvector memory chunks |
| ❌ | `ModelSelector.tsx` | Dropdown to switch models with capability badges |
| ❌ | `ConversationExporter.tsx` | Full export UI with correction mode per-message |
| ❌ | `UserProfileModal.tsx` | Full profile editor (currently inline in page.tsx) |
| ❌ | `Toast.tsx` | Extracted reusable toast notification component |
| ❌ | `SearchResultsCard.tsx` | Rich search result display with source cards |

### UI Features in `page.tsx`

| Status | Feature |
|--------|---------|
| ✅ | Session create / select / rename / delete |
| ✅ | Streaming message display (token-by-token) |
| ✅ | Typing animation indicator |
| ✅ | Copy message to clipboard |
| ✅ | Edit user message (re-sends) |
| ✅ | Share message |
| ✅ | Thumbs up / thumbs down feedback |
| ✅ | Live code sandbox (Workspace toggle) |
| ✅ | File upload to memory (txt, md, js, ts, py, json, html, css, csv) |
| ✅ | Routing reason & complexity score display |
| ✅ | Resolved model + fallback display |
| ✅ | Abort / cancel streaming |
| ✅ | Sync conversation to training pipeline button |
| ✅ | User profile modal (name, pronoun, description) |
| ✅ | Mobile tab switching (chat / workspace) |
| ✅ | Sidebar drag-to-resize |
| ✅ | Workspace drag-to-resize |
| ❌ | Dark/light mode toggle |
| ❌ | Keyboard shortcuts panel (Ctrl+K command palette) |
| ❌ | Voice input (Web Speech API) |
| ❌ | Voice output (TTS for AI responses) |
| ❌ | Message search within session |
| ❌ | Export session to PDF / Markdown file |
| ❌ | Pinned / starred messages |
| ❌ | Session folders / categories |
| ❌ | Drag-and-drop image input |
| ❌ | Multi-session comparison view |

---

## 3. API Layer

### Route Handlers

| Status | Route | File | Purpose |
|--------|-------|------|---------|
| ✅ | `POST /api/chat` | [route.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/app/api/chat/route.ts) | Main streaming inference endpoint — calls orchestrator, streams tokens |
| ✅ | `GET/POST /api/companions` | [route.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/app/api/companions/route.ts) | Session management — list, create sessions |
| ✅ | `GET/DELETE /api/messages` | [route.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/app/api/messages/route.ts) | Fetch or delete messages for a session |
| ✅ | `POST /api/documents/upload` | [route.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/app/api/documents/upload/route.ts) | Upload file → chunk → embed → insert to pgvector |
| ✅ | `POST/GET /api/export-conversation` | [route.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/app/api/export-conversation/route.ts) | Export session to self-improvement training pipeline |
| ❌ | `GET /api/memories` | — | Browse all memory chunks for a user |
| ❌ | `DELETE /api/memories/:id` | — | Delete a specific memory chunk |
| ❌ | `GET /api/models` | — | List available Ollama models with capability metadata |
| ❌ | `POST /api/feedback` | — | Store thumbs up/down feedback to Supabase |
| ❌ | `GET /api/training/status` | — | Return latest training log events for dashboard |
| ❌ | `POST /api/training/start` | — | Trigger training or smoke test from UI |
| ❌ | `GET /api/analytics` | — | Return aggregated message/token/model usage stats |
| ❌ | `POST /api/search` | — | Standalone semantic search endpoint |
| ❌ | `POST /api/transcribe` | — | Voice-to-text via Whisper (local) |

---

## 4. AI Engine (Core Intelligence)

All modules are in [src/lib/ai/](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/)

### Orchestration

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [orchestrator.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/orchestrator.ts) | Master coordinator — intent → context → memory → model → stream |
| ✅ | [intentClassifier.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/intentClassifier.ts) | Classifies user intent (greeting, code, search, weather, memory, etc.) |
| ✅ | [contextAssembler.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/contextAssembler.ts) | Assembles context window from memories, search, session history |
| ✅ | [tokenBudget.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/tokenBudget.ts) | Distributes token budget across memory, context, and prompt |
| ✅ | [cadence.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/cadence.ts) | Determines response length/verbosity based on query type |
| ✅ | [postprocess.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/postprocess.ts) | Cleans, formats, deduplicates AI output before sending |
| ✅ | [recovery.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/recovery.ts) | Graceful degradation — generates fallback if model fails |
| ✅ | [metrics.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/metrics.ts) | Telemetry — tracks latency, token count, model used per request |

### Routing

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [modelRouter.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/modelRouter.ts) | Routes to best model — **Single-model mode active** (`qwen2.5:0.5b`) |
| ✅ | [modelRegistry.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/modelRegistry.ts) | Metadata for each model: strengths, VRAM needs, task types |
| ✅ | [routingMemory.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/routingMemory.ts) | Remembers last model per session, enforces switch cooldowns |
| ✅ | [routingReason.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/routingReason.ts) | Explains why a model was chosen (shown in UI) |
| ✅ | [preload.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/preload.ts) | Preloads the likely next model to eliminate cold-start delay |
| ✅ | [streamSession.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/streamSession.ts) | Locks model for duration of streaming — prevents mid-stream switches |

### Memory & Knowledge

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [memory.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/memory.ts) | Extract + store + query semantic memories via pgvector |
| ✅ | [embeddings.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/embeddings.ts) | Generates embeddings via Ollama (`nomic-embed-text`) or math fallback |
| ✅ | [chunker.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/chunker.ts) | Splits uploaded documents into overlapping chunks for RAG |
| ✅ | [contextRanker.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/contextRanker.ts) | Re-ranks retrieved memories by relevance before injection |
| ✅ | [reranker.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/reranker.ts) | Re-ranks search snippets by query relevance |
| ✅ | [behavioralMemory.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/behavioralMemory.ts) | Tracks user tone, style, preferences to adapt responses |
| ✅ | [summary.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/summary.ts) | Auto-summarizes long sessions to compress context |
| ✅ | [cache.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/cache.ts) | In-memory TTL cache for search results and embeddings |
| ❌ | `longTermMemory.ts` | Persistent cross-session facts (relationships, preferences) |
| ❌ | `memoryDecay.ts` | Decay old/irrelevant memories to prevent context bloat |
| ❌ | `episodicMemory.ts` | Store and recall full episode summaries per date |

### Tools & Search

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [tools.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/tools.ts) | Tool dispatcher — searchWeb, getWeather, computeMath |
| ✅ | [search.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/search.ts) | Live web search via DuckDuckGo scraper + result parsing |
| ✅ | [scraper.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/scraper.ts) | Fetches and cleans page content for RAG injection |
| ✅ | [weather.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/weather.ts) | Live weather retrieval |
| ❌ | `calculator.ts` | Safe math expression evaluator |
| ❌ | `codeRunner.ts` | Server-side sandboxed code execution (Python, Node) |
| ❌ | `fileSearch.ts` | Search across uploaded documents by semantic similarity |
| ❌ | `imageAnalysis.ts` | Accept image input → describe via multimodal model |

### Prompts

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [prompts/index.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/prompts/index.ts) | Master prompt builder — injects all sections |
| ✅ | [prompts/system.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/prompts/system.ts) | Core Antgravity identity and system prompt |
| ✅ | [prompts/style.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/prompts/style.ts) | Tone, format, style instructions |
| ✅ | [prompts/memory.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/prompts/memory.ts) | Memory injection section |
| ✅ | [prompts/cadence.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/prompts/cadence.ts) | Response length / verbosity instructions |
| ✅ | [prompts/routing.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/prompts/routing.ts) | Routing-aware instructions (adapt per model) |
| ❌ | `prompts/persona.ts` | Per-companion persona injection system |
| ❌ | `prompts/tools.ts` | Tool-use instructions (function calling format) |

### Live Code Preview Workspace

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [preview/codeDetector.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/preview/codeDetector.ts) | Detects executable code in AI response (HTML, React, JS) |
| ✅ | [preview/previewRuntime.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/preview/previewRuntime.ts) | Injects code into sandboxed iframe with hot-reload |
| ✅ | [preview/virtualFs.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/preview/virtualFs.ts) | In-memory virtual file system for multi-file projects |
| ✅ | [preview/componentMemory.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/preview/componentMemory.ts) | Remembers sandbox state between messages |
| ✅ | [preview/previewRecovery.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/preview/previewRecovery.ts) | Auto-repairs broken preview on error |
| ✅ | [codeTemplates.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/ai/codeTemplates.ts) | Boilerplate templates for common generated code patterns |
| ❌ | `preview/packageResolver.ts` | Resolve npm CDN packages for sandbox use |
| ❌ | `preview/cssInjector.ts` | Auto-inject Tailwind or Bootstrap into generated previews |

---

## 5. Training Pipeline

All files in [training/](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/)

### Configuration & Templates

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [configs/qlora_config.yaml](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/configs/qlora_config.yaml) | All QLoRA hyperparameters — batch size, rank, learning rate, targets |
| ✅ | [Modelfile.template](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/Modelfile.template) | Ollama Modelfile template with system prompt and inference params |

### Scripts

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [scripts/check_environment.py](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/scripts/check_environment.py) | Pre-flight CUDA, PyTorch, bitsandbytes, VRAM diagnostics |
| ✅ | [scripts/prepare_dataset.py](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/scripts/prepare_dataset.py) | Clean, deduplicate, filter, 95/5 split training dataset |
| ✅ | [train.py](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/train.py) | Main QLoRA trainer — gradient checkpointing, OOM recovery, streaming logs |
| ✅ | [scripts/monitor_training.py](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/scripts/monitor_training.py) | Live terminal dashboard — loss sparkline, VRAM bar, ETA |
| ✅ | [scripts/export_to_gguf.py](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/scripts/export_to_gguf.py) | Merge adapter → full model → print llama.cpp GGUF instructions |
| ✅ | [scripts/self_improve.py](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/scripts/self_improve.py) | Full self-improvement loop: exports → dedupe → merge → retrain |
| ✅ | [scripts/merge_conversation_exports.py](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/scripts/merge_conversation_exports.py) | Manually merge conversation JSON files into training dataset |
| ✅ | [scripts/create_ollama_model.ps1](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/training/scripts/create_ollama_model.ps1) | PowerShell — create Ollama model from GGUF + verify |
| ❌ | `scripts/evaluate_model.py` | Run BLEU/ROUGE/perplexity evals on test set |
| ❌ | `scripts/compare_versions.py` | Side-by-side benchmark between v1/v2/v3 of antgravity |
| ❌ | `scripts/chat_with_model.py` | Simple CLI to test fine-tuned model without Ollama |

### Training Directories

| Status | Directory | Purpose |
|--------|-----------|---------|
| ✅ | `training/adapters/` | Saved LoRA adapter checkpoints (antgravity-v1, v2…) |
| ✅ | `training/checkpoints/` | Mid-training Trainer checkpoints for auto-resume |
| ✅ | `training/exports/` | Merged full models + GGUF files for Ollama |
| ✅ | `training/logs/` | Streaming JSONL training logs + evolution history |
| ✅ | `training/conversations/` | Raw exported sessions + user corrections for retraining |
| ✅ | `training/datasets/` | Prepared train.json and eval.json splits |
| ✅ | `training/models/` | Base model cache directory |

---

## 6. Database Layer

### Supabase / PostgreSQL Tables

| Status | Table | Purpose |
|--------|-------|---------|
| ✅ | `candy_sessions` | Chat session records (id, title, created_at) |
| ✅ | `candy_messages` | All messages (session_id, sender, content, created_at) |
| ✅ | `candy_memories` | pgvector memory chunks (embedding vector, content, session_id) |
| ❌ | `candy_feedback` | Thumbs up/down ratings per message (connected to training loop) |
| ❌ | `candy_analytics` | Per-request metrics: model used, tokens, latency, routing reason |
| ❌ | `candy_user_profiles` | Persistent user profile (name, pronoun, preferences) |
| ❌ | `candy_training_runs` | Training run history (version, samples, loss, duration) |
| ❌ | `candy_corrections` | Human corrections to AI responses, linked to messages |

### Supabase Client

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [lib/supabaseClient.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/src/lib/supabaseClient.ts) | Initializes Supabase client with env vars |

---

## 7. Datasets

Located in [datasets/](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/datasets/)

| Status | File | Size | Description |
|--------|------|------|-------------|
| ✅ | `final_training_dataset.json` | 44 MB | Merged master training dataset |
| ✅ | `ultrachat_5k.json` | 36 MB | UltraChat conversational dataset (5k samples) |
| ✅ | `ultrachat_cleaned.json` | 31 MB | Cleaned version |
| ✅ | `oasst1_5k.json` | 11 MB | OpenAssistant dataset (5k samples) |
| ✅ | `oasst1_cleaned.json` | 3.7 MB | Cleaned version |
| ✅ | `codealpaca_20k.json` | 7.5 MB | Code Alpaca coding dataset (20k samples) |
| ✅ | `codealpaca_cleaned.json` | 9.7 MB | Cleaned version |
| ✅ | `merge_datasets.py` | — | Script to merge all datasets into final |
| ❌ | `antgravity_conversations.json` | — | Real user conversation exports (generated over time) |
| ❌ | `antgravity_corrections.json` | — | Human-corrected responses for RLHF-style tuning |

---

## 8. Infrastructure & Config

| Status | File | Purpose |
|--------|------|---------|
| ✅ | [next.config.ts](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/next.config.ts) | Next.js configuration |
| ✅ | [tsconfig.json](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/tsconfig.json) | TypeScript paths and compiler options |
| ✅ | [package.json](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/package.json) | Dependencies: Next.js, Supabase, Lucide, Playwright |
| ✅ | [.gitignore](file:///c:/Users/choco/OneDrive/Documents/Candy.ai/.gitignore) | Git exclusions |
| ✅ | `AGENTS.md` | Rules for AI agents working on this project |
| ❌ | `.env.local` | Supabase URL, anon key, API keys (create manually) |
| ❌ | `docker-compose.yml` | Containerize app + Ollama for portability |
| ❌ | `.github/workflows/ci.yml` | GitHub Actions CI — typecheck + lint on push |
| ❌ | `Makefile` | Shortcut commands: `make dev`, `make train`, `make smoke` |

---

## 9. Full Feature Roadmap — Yet to Build

### 🔴 High Priority (Core Features Missing)

| Feature | Where | Notes |
|---------|-------|-------|
| **Feedback → Database** | `MessageBubble.tsx` + `/api/feedback` | Thumbs up/down only updates local state. Must persist to `candy_feedback` and feed self-improvement loop |
| **User Profile Persistence** | `page.tsx` → Supabase | Profile is in-memory only. Needs Supabase `candy_user_profiles` row |
| **Memory Browser UI** | New `/memories` page | Let user see, search, pin, or delete stored memories |
| **Settings Page** | New `/settings` page | Model pin/unpin, system prompt override, memory depth, timeout |
| **Model Selector UI** | Header dropdown | Switch active model from UI (currently hardcoded to `qwen2.5:0.5b`) |
| **Feedback → Training Loop** | `self_improve.py` + `candy_feedback` | Use thumbs-down messages as negative signal for RLHF-style tuning |

### 🟡 Medium Priority (Intelligence Upgrades)

| Feature | Where | Notes |
|---------|-------|-------|
| **Cross-session Memory** | `memory.ts` | Currently memories are scoped per session — should span all sessions |
| **Long-term Memory Decay** | New `memoryDecay.ts` | Auto-archive low-relevance memories after N days |
| **Function Calling / Tool Use** | `tools.ts` + prompts | Structured JSON tool calling instead of text-parsing |
| **Model Evaluation Script** | `training/scripts/evaluate_model.py` | BLEU/ROUGE/perplexity eval on test set after fine-tuning |
| **Image Input Support** | `/api/chat` + UI | Accept image drag-drop → route to multimodal model (LLaVA) |
| **Local Whisper STT** | `/api/transcribe` | Voice-to-text using locally running Whisper |
| **Sandboxed Code Runner** | New `codeRunner.ts` + API route | Run Python/JS server-side safely and return output |
| **Analytics Dashboard** | `/api/analytics` + `/analytics` page | Token usage, routing decisions, session stats |

### 🟢 Nice to Have (UX & Polish)

| Feature | Where | Notes |
|---------|-------|-------|
| **Dark/Light Mode Toggle** | `globals.css` + `page.tsx` | CSS variable swap with `data-theme` attribute |
| **Keyboard Shortcut Panel (Ctrl+K)** | `page.tsx` | Command palette for power users |
| **Session Folders** | `Sidebar.tsx` | Group sessions by project or topic with drag-and-drop |
| **Export to Markdown / PDF** | `page.tsx` | Download full session as file |
| **Pinned Messages** | `MessageBubble.tsx` | Star important AI responses for quick access |
| **Training Dashboard UI** | New `/training` page | Visual VRAM bar, loss graph from JSONL logs |
| **Turbopack Root Warning Fix** | `next.config.ts` | Set `turbopack.root` to silence lockfile warning |
| **Code Block Copy Button** | `MarkdownRenderer.tsx` | One-click copy inside rendered code blocks |
| **Streaming Cancel Note** | `page.tsx` | Show "Generation stopped" inline when user aborts |
| **Docker Compose** | `docker-compose.yml` | Containerize app + Ollama for one-command deployment |

---

## Current Active Configuration

```
Model:          qwen2.5:0.5b  (SINGLE_MODEL_MODE = true)
Embeddings:     nomic-embed-text:latest via Ollama (math fallback active)
Database:       Supabase PostgreSQL + pgvector
Dev Server:     http://localhost:3001
Base Model:     Qwen/Qwen2.5-3B-Instruct (for QLoRA fine-tuning)
Fine-tuned:     Not yet started (pipeline fully ready)
Platform:       AMD Ryzen 7 7445HS · RTX 2050 4GB · 16GB RAM · Windows 11
```

---

*Last updated: 2026-05-21 — Antgravity v2*
