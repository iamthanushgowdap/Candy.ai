import { IntentResult } from "./intentClassifier";

export interface OptimizationProfile {
  path: "simple" | "medium" | "complex";
  token_budget: number;
  latency_estimate_ms: number;
  skip_search: boolean;
  skip_weather: boolean;
}

export interface InferenceTrace {
  intent: string;
  memory_used: string[];
  rag_used: boolean;
  tools_used: string[];
  final_prompt: string;
  model_response: string;
  performance: {
    latency_estimate: number;
    optimization_path_used: string;
    token_budget_used: number;
    cache_hits: { embedding: number; search: number; query: number; total: number };
  };
}

// Global cache hit counters
let embeddingCacheHits = 0;
let searchCacheHits = 0;
let queryCacheHits = 0;

export function incrementEmbeddingCacheHits(): void {
  embeddingCacheHits++;
}

export function incrementSearchCacheHits(): void {
  searchCacheHits++;
}

export function incrementQueryCacheHits(): void {
  queryCacheHits++;
}

export function getCacheHits(): { embedding: number; search: number; query: number; total: number } {
  return {
    embedding: embeddingCacheHits,
    search: searchCacheHits,
    query: queryCacheHits,
    total: embeddingCacheHits + searchCacheHits + queryCacheHits
  };
}

/**
 * Performance Optimizer (Component D)
 * Dynamically routes queries to the lightest possible processing pipeline
 * and allocates target token budgets to ensure sub-2-second first-token times.
 */
export function getOptimizationProfile(
  message: string,
  intent: IntentResult,
  historyLength: number,
  complexityScore: number
): OptimizationProfile {
  const lowerMsg = message.toLowerCase().trim();

  // 1. Simple Path: Greeting or extremely brief conversational turn
  // Latency target: <250ms (first token)
  const isVeryShort = lowerMsg.length < 15;
  const isGreetingOrSimple = intent.isGreeting || (intent.isConversational && isVeryShort && !intent.needsMemoryRecall);

  if (isGreetingOrSimple && !intent.needsWebSearch && !intent.needsWeather) {
    return {
      path: "simple",
      token_budget: 600, // Minimal context budget for speedy lookup & generation
      latency_estimate_ms: 300,
      skip_search: true,
      skip_weather: true
    };
  }

  // 2. Medium Path: Conversational with memory dependency, but low logic complexity
  // Latency target: <700ms
  const isMediumComplexity = complexityScore < 0.40 && !intent.isCodeGen;
  if (isMediumComplexity && !intent.needsWebSearch && !intent.needsWeather) {
    return {
      path: "medium",
      token_budget: 1200, // Medium comfort budget
      latency_estimate_ms: 650,
      skip_search: true,
      skip_weather: true
    };
  }

  // 3. Complex Path: Coding queries, web search, weather, or highly complex analytics
  // Latency target: <1500ms
  return {
    path: "complex",
    token_budget: 2500, // Maximum pipeline budget
    latency_estimate_ms: 1400,
    skip_search: !intent.needsWebSearch,
    skip_weather: !intent.needsWeather
  };
}
