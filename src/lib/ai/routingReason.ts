/**
 * Routing Reason Engine — Antgravity AI Engine
 *
 * Computes structured confidence, intent, and complexity scores for model routing.
 */

import { IntentResult } from "./intentClassifier";

export interface RoutingReason {
  model: string;
  reason: string;
  confidence: number;
  complexityScore: number;
  contextDepth: number;
}

export function evaluateRoutingDecision(
  message: string,
  intent: IntentResult,
  historyLength: number,
  selectedModel: string,
  complexityScore: number
): RoutingReason {
  let reason = "default_fallback";
  let confidence = 0.75;

  if (intent.isGreeting) {
    reason = "casual_greeting_detected";
    confidence = 0.98;
  } else if (intent.isCodeGen || message.toLowerCase().includes("code")) {
    reason = "technical_intent_detected";
    confidence = 0.95;
  } else if (complexityScore > 0.6) {
    reason = "high_cognitive_complexity";
    confidence = 0.88;
  } else if (intent.needsWebSearch) {
    reason = "factual_retrieval_required";
    confidence = 0.90;
  } else if (historyLength >= 3) {
    reason = "extended_conversation_context";
    confidence = 0.82;
  } else if (message.trim().length > 70) {
    reason = "lengthy_query_escalation";
    confidence = 0.80;
  }

  return {
    model: selectedModel,
    reason,
    confidence,
    complexityScore,
    contextDepth: Math.min(1.0, historyLength / 10)
  };
}
