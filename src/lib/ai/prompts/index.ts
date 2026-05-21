/**
 * Prompt System — Modularized, intent-driven prompt selection
 */

import { IntentResult } from "../intentClassifier";
import { BASE_PROMPT, IDENTITY_PROMPT, GREETING_PROMPT } from "./system";
import { FACTUAL_PROMPT, WEATHER_PROMPT } from "./routing";
import { CODE_PROMPT, CREATIVE_PROMPT, CONVERSATIONAL_PROMPT } from "./style";

export * from "./system";
export * from "./routing";
export * from "./memory";
export * from "./style";
export * from "./cadence";

export function selectPrompt(intent: IntentResult): string {
  if (intent.isGreeting) return GREETING_PROMPT;
  if (intent.isIdentityQuery) return IDENTITY_PROMPT;
  if (intent.isCodeGen) return CODE_PROMPT;
  if (intent.isConversational) return CONVERSATIONAL_PROMPT;
  if (intent.needsWeather) return WEATHER_PROMPT;
  if (intent.needsWebSearch) return FACTUAL_PROMPT;
  if (intent.isTaskDirective) return CREATIVE_PROMPT;
  return BASE_PROMPT;
}

// ─── Legacy compatibility exports ────────────────────────────────────────────
export const SYSTEM_PROMPTS = {
  base: BASE_PROMPT,
  greeting: GREETING_PROMPT,
  safetyFallback: "An unexpected error occurred. I'm ready to help with something else."
};
