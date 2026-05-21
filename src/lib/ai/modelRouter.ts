/**
 * Multi-Model Routing Logic — Antgravity AI Engine
 *
 * Automatically selects the appropriate local model depending on:
 *   - conversational intent
 *   - query complexity
 *   - history/context depth
 *   - active hardware VRAM load
 */

import { IntentResult } from "./intentClassifier";
import { getActiveModelId } from "./modelRegistry";

export const LIGHTWEIGHT_MODEL    = "qwen2.5:0.5b";
export const CONVERSATIONAL_MODEL  = "qwen2.5:3b";
export const CODING_MODEL          = "qwen2.5:3b";
export const GENERAL_FALLBACK_MODEL = "qwen2.5:3b";
export const ANTGRAVITY_MODEL      = "qwen2.5:3b";

/**
 * SINGLE_MODEL_MODE: When true, ALL routing is bypassed and every request
 * is served by the currently active registry model regardless of complexity, intent, or keywords.
 * Set to false to re-enable smart multi-model routing.
 */
export const SINGLE_MODEL_MODE = false;
export function getPinnedModel() {
  return getActiveModelId();
}

export const MODEL_NAMES: Record<string, string> = {
  "qwen2.5:0.5b": "Qwen 2.5 (0.5B) ⚡"
};

const CODING_KEYWORDS = [
  "code", "program", "function", "class", "react", "next.js", "nextjs",
  "html", "css", "javascript", "typescript", "python", "rust", "c++", "java",
  "sql", "database", "api", "json", "yaml", "xml", "git", "docker", "regex",
  "compiler", "bug", "debug", "error", "refactor", "algorithm", "schema"
];

const COMPLEXITY_KEYWORDS = [
  "explain", "analyze", "describe", "compare", "contrast", "elaborate",
  "strategic", "plan", "summary", "summarize", "brainstorm", "opinion",
  "history", "philosophy", "science", "math", "quantum", "physics"
];

// Queries that benefit most from Antgravity`s specialized conversational training
const EMOTIONAL_KEYWORDS = [
  "feel", "feeling", "emotion", "lonely", "anxious", "anxiety", "depressed",
  "depression", "stressed", "stress", "overwhelmed", "happy", "sad", "love",
  "relationship", "friend", "family", "help me", "i`m struggling", "advice",
  "what should i do", "i don't know", "confused", "lost", "scared", "worried",
  "dream", "goal", "motivation", "purpose", "meaning", "life"
];

/**
 * Calculates a complexity score between 0.0 and 1.0 based on structural depth,
 * query length, and advanced/analytical terms.
 */
export function computeComplexityScore(message: string): number {
  const lower = message.toLowerCase();
  let score = 0;

  // Length weight (up to 0.3)
  score += Math.min(0.3, message.length / 450);

  // Logical connectors (up to 0.2)
  if (lower.includes("because") || lower.includes("however") || lower.includes("although") || lower.includes("therefore")) {
    score += 0.1;
  }
  const questionCount = (lower.match(/\?/g) || []).length;
  if (questionCount > 1) {
    score += 0.1;
  }

  // Analytical complexity keywords (up to 0.5)
  const heavyKeywords = [
    "philosophy", "existential", "epistemology", "architecture", "microservices",
    "scalability", "bottleneck", "optimization", "quantum", "relativity",
    "mechanism", "comparative", "differentiate", "strategic", "implication"
  ];
  let keywordMatches = 0;
  for (const kw of heavyKeywords) {
    if (lower.includes(kw)) keywordMatches++;
  }
  score += Math.min(0.5, keywordMatches * 0.15);

  return Math.min(1.0, score);
}

/**
 * Dynamically routes a request to the best model.
 * 
 * @param message The raw user query
 * @param intent The classified intent structure
 * @param historyLength The number of previous messages in the current session
 * @param complexityScore Pre-computed prompt complexity score
 * @returns The target model name
 */
export function routeRequest(
  message: string,
  intent: IntentResult,
  historyLength: number,
  complexityScore: number,
  antgravityAvailable: boolean = false
): string {
  // ── SINGLE MODEL MODE: bypass all routing ─────────────────────────────────
  if (SINGLE_MODEL_MODE) {
    const active = getPinnedModel();
    console.log(`[ModelRouter] Single-model mode — using ${active}`);
    return active;
  }

  const lower = message.toLowerCase();

  // 1. Coding & Technical (highest priority switch)
  const containsCodingKeyword = CODING_KEYWORDS.some(word => lower.includes(word));
  if (intent.isCodeGen || containsCodingKeyword) {
    console.log(`[ModelRouter] Routing to CODING: ${CODING_MODEL} (Complexity: ${complexityScore})`);
    return CODING_MODEL;
  }

  // 2. Greetings — ultra-fast lightweight response
  if (intent.isGreeting) {
    console.log(`[ModelRouter] Routing to LIGHTWEIGHT (Greeting): ${LIGHTWEIGHT_MODEL}`);
    return LIGHTWEIGHT_MODEL;
  }

  // 3. Antgravity — premium conversational intelligence layer
  if (antgravityAvailable) {
    const containsEmotionalKeyword = EMOTIONAL_KEYWORDS.some(word => lower.includes(word));
    const isDeepConversation = historyLength >= 3;
    const isComplexAnalysis  = complexityScore > 0.55;
    const containsComplexKeyword = COMPLEXITY_KEYWORDS.some(word => lower.includes(word));
    const isLongMessage = message.trim().length > 70;

    if (containsEmotionalKeyword || isDeepConversation || isComplexAnalysis || containsComplexKeyword || isLongMessage) {
      console.log(`[ModelRouter] Routing to ANTGRAVITY: ${ANTGRAVITY_MODEL}`);
      return ANTGRAVITY_MODEL;
    }
  }

  // 4. Conversational / Complex fallback
  const isLongMessage = message.trim().length > 70;
  const containsComplexKeyword = COMPLEXITY_KEYWORDS.some(word => lower.includes(word));
  const hasContextNeeds = intent.needsMemoryRecall || historyLength >= 3;

  if (complexityScore > 0.55 || isLongMessage || containsComplexKeyword || hasContextNeeds) {
    console.log(`[ModelRouter] Routing to CONVERSATIONAL: ${CONVERSATIONAL_MODEL} (Complexity: ${complexityScore})`);
    return CONVERSATIONAL_MODEL;
  }

  // 5. Default to Lightweight
  console.log(`[ModelRouter] Routing to LIGHTWEIGHT (Default): ${LIGHTWEIGHT_MODEL}`);
  return LIGHTWEIGHT_MODEL;
}

/**
 * Lists available models from the local Ollama instance.
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/tags`, {
      signal: AbortSignal.timeout(1200)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.models)) {
        return data.models.map((m: any) => m.name);
      }
    }
  } catch (e) {
    console.warn("[ModelRouter] Failed to fetch available Ollama models:", e);
  }
  return [];
}

/**
 * Queries the active model processes loaded in memory/VRAM in Ollama.
 */
export async function getActiveVramUsage(): Promise<{ usageBytes: number; loadedModels: string[] }> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/ps`, {
      signal: AbortSignal.timeout(1000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.models)) {
        let usageBytes = 0;
        const loadedModels: string[] = [];
        for (const m of data.models) {
          usageBytes += m.size_vram || 0;
          loadedModels.push(m.name);
        }
        return { usageBytes, loadedModels };
      }
    }
  } catch (e) {
    // Ignore error
  }
  return { usageBytes: 0, loadedModels: [] };
}

/**
 * Resolves the requested model against the list of available local models.
 * If the routed model is not available or if the VRAM is heavily overloaded,
 * falls back to an available model (preferably qwen2.5:0.5b).
 */
export async function resolveRoutedModel(routed: string): Promise<string> {
  // ── SINGLE MODEL MODE: skip all resolution logic ──────────────────────────
  if (SINGLE_MODEL_MODE) {
    const active = getPinnedModel();
    console.log(`[ModelRouter] Resolve short-circuit — single-model mode: ${active}`);
    return active;
  }

  const available = await getAvailableModels();
  console.log(`[ModelRouter] Available local models:`, available);

  if (available.length === 0) {
    console.log(`[ModelRouter] No models found or Ollama offline. Falling back to lightweight: ${LIGHTWEIGHT_MODEL}`);
    return LIGHTWEIGHT_MODEL;
  }

  // 1. Hardware load check (VRAM constraint check)
  const hardware = await getActiveVramUsage();
  const vramGb = hardware.usageBytes / (1024 * 1024 * 1024);
  console.log(`[ModelRouter] Active VRAM Usage: ${vramGb.toFixed(2)} GB | Loaded models:`, hardware.loadedModels);

  // If VRAM load is excessive (> 3.5 GB loaded) and we want to load a large model, fallback to save memory
  if (vramGb > 3.5 && (routed === CONVERSATIONAL_MODEL || routed === ANTGRAVITY_MODEL)) {
    console.warn(`[ModelRouter] VRAM pressure high (${vramGb.toFixed(2)} GB). Downgrading to lightweight fallback.`);
    if (available.includes(LIGHTWEIGHT_MODEL)) {
      return LIGHTWEIGHT_MODEL;
    }
  }

  // 2. Exact match check
  if (available.includes(routed)) {
    return routed;
  }

  // 3. Antgravity graceful fallback chain
  // If antgravity not yet trained/installed, fall back to gemma3:4b → qwen2.5:3b → lightweight
  if (routed === ANTGRAVITY_MODEL) {
    console.warn(`[ModelRouter] antgravity not available yet — falling back to conversational model`);
    if (available.includes(CONVERSATIONAL_MODEL)) return CONVERSATIONAL_MODEL;
    if (available.includes(GENERAL_FALLBACK_MODEL)) return GENERAL_FALLBACK_MODEL;
    return LIGHTWEIGHT_MODEL;
  }

  // 3. Prefix check or fuzzy match
  const matched = available.find(
    (m) =>
      m === routed ||
      m.startsWith(routed + ":") ||
      routed.startsWith(m + ":")
  );
  if (matched) {
    console.log(`[ModelRouter] Fuzzy matched "${routed}" to "${matched}"`);
    return matched;
  }

  // 4. General fallback check (if qwen2.5:3b is pulled, prefer it over 0.5b for conversational/coding fallbacks)
  if (available.includes(GENERAL_FALLBACK_MODEL) && routed !== LIGHTWEIGHT_MODEL) {
    console.log(`[ModelRouter] "${routed}" not available. Using general fallback: ${GENERAL_FALLBACK_MODEL}`);
    return GENERAL_FALLBACK_MODEL;
  }

  // 5. Absolute fallback - find any chat model excluding embeds
  const chatModels = available.filter((m) => !m.toLowerCase().includes("embed"));
  if (chatModels.length > 0) {
    if (chatModels.includes(LIGHTWEIGHT_MODEL)) {
      console.log(`[ModelRouter] "${routed}" not available. Falling back to light model: ${LIGHTWEIGHT_MODEL}`);
      return LIGHTWEIGHT_MODEL;
    }
    console.log(`[ModelRouter] "${routed}" not available. Falling back to first available: ${chatModels[0]}`);
    return chatModels[0];
  }

  console.log(`[ModelRouter] Absolute fallback: ${LIGHTWEIGHT_MODEL}`);
  return LIGHTWEIGHT_MODEL;
}
