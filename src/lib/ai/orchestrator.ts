/**
 * Core AI Orchestration Layer — Antgravity v3
 *
 * A coordinator that delegates to specialized modules:
 *   - intentClassifier   → routes intent
 *   - contextAssembler   → retrieves + ranks context
 *   - memoryIntelligence  → ranks & compresses vector memory
 *   - performanceOptimizer → controls speeds and token budgets
 *   - modelRouter        → hardware-aware & complexity-aware model selector
 *   - preloader          → preloads models to minimize cold-starts
 *   - routingMemory      → enforces switch cooldowns & continuity locks
 *   - streamSession      → prevents mid-stream routing switches
 *   - recovery           → graceful degradation
 *   - telemetry          → observability
 */

import { classifyIntent } from "./intentClassifier";
import { assembleContext } from "./contextAssembler";
import { extractAndStoreMemory } from "./memory";
import { updateBehavioralProfile } from "./behavioralMemory";
import { summarizeSession } from "./summary";
import { selectPrompt } from "./prompts";
import { apportionTokenBudget } from "./tokenBudget";
import { determineCadence } from "./cadence";
import { telemetry } from "./metrics";
import { generateGracefulFallback } from "./recovery";
import {
  routeRequest,
  resolveRoutedModel,
  computeComplexityScore,
  LIGHTWEIGHT_MODEL,
  CONVERSATIONAL_MODEL,
  CODING_MODEL,
  getAvailableModels,
  ANTGRAVITY_MODEL
} from "./modelRouter";
import { preloadManager } from "./preload";
import { routingMemoryManager } from "./routingMemory";
import { streamSessionManager } from "./streamSession";
import { evaluateRoutingDecision, RoutingReason } from "./routingReason";
import { getOptimizationProfile, getCacheHits, InferenceTrace, incrementQueryCacheHits } from "./performanceOptimizer";
import { queryCache } from "./cache";

export interface ChatContext {
  sessionId: string;
  message: string;
  userProfile: { name: string; pronoun: string; description: string };
  chatHistory: { role: "user" | "assistant"; content: string }[];
  model?: string;
  signal?: AbortSignal;
  requestId?: string;
}

export interface OrchestrationResult {
  response: string;
  stream?: ReadableStream;
  toolTriggered?: string;
  toolResult?: string;
  memorySaved?: string | null;
  allocatedModel: string;
  resolvedModel: string;
  routingReason: RoutingReason;
  inferenceTrace?: InferenceTrace;
}

export async function orchestrateResponse(context: ChatContext): Promise<OrchestrationResult> {
  const { sessionId, message, userProfile, chatHistory, model, signal, requestId: passedRequestId } = context;

  const requestId = passedRequestId || `${sessionId}-${Date.now()}`;
  const isSelfManagedTelemetry = !passedRequestId;

  if (isSelfManagedTelemetry) {
    telemetry.startSession(requestId);
  }
  console.log(`[Orchestrator] Starting strict deterministic pipeline for request: "${message}"`);

  // ── 1. Intent Classification ─────────────────────────────────────────────
  const intent = classifyIntent(message, chatHistory.length > 0);
  console.log(`[Orchestrator] Intent classified: ${intent.label}`);

  // ── Query Cache Lookup (Phase 4) ──────────────────────────────────────────
  const cacheKey = message.toLowerCase().trim();
  const cachedResponse = await queryCache.get<string>(cacheKey);
  if (cachedResponse) {
    console.log(`[Orchestrator] Query Cache HIT for: "${message}"`);
    incrementQueryCacheHits();

    // Construct a ReadableStream yielding the cached response in Ollama format
    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({
          message: { content: cachedResponse },
          done: true
        }) + "\n"));
        controller.close();
      }
    });

    const optProfile = getOptimizationProfile(message, intent, chatHistory.length, computeComplexityScore(message));
    const inferenceTrace: InferenceTrace = {
      intent: intent.label,
      memory_used: [],
      rag_used: false,
      tools_used: [],
      final_prompt: `[Cached Query] ${message}`,
      model_response: cachedResponse,
      performance: {
        latency_estimate: 0,
        optimization_path_used: "cached",
        token_budget_used: 0,
        cache_hits: getCacheHits()
      }
    };

    if (isSelfManagedTelemetry) {
      telemetry.endSession(requestId, {
        query: message,
        promptSize: Math.ceil(message.length / 4),
        responseSize: Math.ceil(cachedResponse.length / 4),
        sessionId
      });
    }

    return {
      response: cachedResponse,
      stream: mockStream,
      allocatedModel: "cache",
      resolvedModel: "cache",
      routingReason: {
        model: "cache",
        reason: "Query served from cache",
        complexityScore: 0,
        confidence: 1.0,
        contextDepth: 0
      },
      inferenceTrace
    };
  }

  // ── 2. Complexity & Performance Profile Estimation (Component D) ─────────
  const complexityScore = computeComplexityScore(message);
  const optProfile = getOptimizationProfile(message, intent, chatHistory.length, complexityScore);
  console.log(`[Orchestrator] Dynamic Optimization path: "${optProfile.path}" | Token Budget: ${optProfile.token_budget}`);

  // Trigger non-blocking behavioral update in parallel
  try {
    updateBehavioralProfile(sessionId, message);
  } catch (e) {}
  
  // Get local pulled models listing in parallel
  const availableModelsPromise = getAvailableModels().catch(() => [] as string[]);

  // Pre-load preloaded candidate
  const preloadCandidate = routeRequest(message, intent, chatHistory.length, complexityScore);
  preloadManager.preloadModel(preloadCandidate).catch(() => {});

  // ── 3. Assemble Context via Memory Intelligence (Component A & C) ────────
  // Enforces memory step and context assembler step with no bypass
  const assembled = await assembleContext({
    sessionId,
    message,
    intent,
    requestId,
    chatHistory,
    signal,
    optimizationProfile: optProfile
  });

  const { contextStrings, toolTriggered, toolResult, weatherResult, memoryIntelligenceReport } = assembled;
  let memorySaved: string | null = null;

  // ── 4. Select and Build System Prompt ───────────────────────────────────
  const cadence = determineCadence(message);
  let systemPrompt = selectPrompt(intent);

  if (contextStrings.length > 0) {
    systemPrompt += `\n\n[Context]\n${contextStrings.map(s => `- ${s}`).join("\n")}`;
  }

  if (userProfile?.name && userProfile.name !== "User") {
    systemPrompt += `\n[User]: ${userProfile.name}`;
  }

  systemPrompt += `\n[Style]: ${cadence.instructions}`;

  // ── 5. Token Budget: dynamically apportioned (Component D) ────────────────
  const { chatHistory: budgetedHistory } = apportionTokenBudget(
    systemPrompt,
    chatHistory,
    [],
    optProfile.token_budget
  );

  const finalHistory = budgetedHistory.map(h => ({
    role: h.role,
    content: h.content.split("\n\n---\n\n### 🔍 Live Verified Search Sources")[0].trim()
  }));

  const finalPromptMessages = [
    { role: "system", content: systemPrompt },
    ...finalHistory,
    { role: "user", content: message }
  ];

  // ── 6. Background Tasks (non-blocking extraction) ─────────────────────────
  if (!intent.isGreeting) {
    setTimeout(() => {
      extractAndStoreMemory(message)
        .then(saved => { if (saved) { memorySaved = saved; } })
        .catch(() => {});

      summarizeSession(sessionId).catch(() => {});
    }, 0);
  }

  // ── 7. Preload Check ─────────────────────────────────────────────────────
  if (chatHistory.length === 0) {
    preloadManager.preloadModel(CONVERSATIONAL_MODEL).catch(() => {});
  }

  // ── 8. Model Routing Selection & Locks ───────────────────────────────────
  const availableModels = await availableModelsPromise;
  const antgravityAvailable = Array.isArray(availableModels) && availableModels.some(
    m => m === ANTGRAVITY_MODEL || m.startsWith(ANTGRAVITY_MODEL + ":")
  );

  let targetModel = routeRequest(message, intent, chatHistory.length, complexityScore, antgravityAvailable);

  if (!model) {
    const memoryState = routingMemoryManager.getOrCreateState(sessionId, LIGHTWEIGHT_MODEL);
    const candidateMode =
      targetModel === CODING_MODEL ? "coding" : targetModel === CONVERSATIONAL_MODEL ? "reasoning" : "casual";
    
    const decision = evaluateRoutingDecision(message, intent, chatHistory.length, targetModel, complexityScore);
    const continuityCheck = routingMemoryManager.shouldSwitchModel(
      sessionId,
      memoryState.lastAllocatedModel,
      targetModel,
      candidateMode,
      decision.confidence
    );
    
    targetModel = continuityCheck.modelToUse;
  } else {
    targetModel = model; // Client override
  }

  const resolvedModel = await resolveRoutedModel(targetModel);
  const isCodeOrReasoning = targetModel === CODING_MODEL || targetModel === CONVERSATIONAL_MODEL;
  const timeoutMs = intent.isGreeting ? 8000 : isCodeOrReasoning ? 35000 : 15000;

  // Stream session locking
  streamSessionManager.lockSessionModel(sessionId, resolvedModel);

  const routingReason = evaluateRoutingDecision(message, intent, chatHistory.length, targetModel, complexityScore);

  console.log(
    `[Orchestrator] Model: ${targetModel} -> Resolved: ${resolvedModel} | Reason: ${routingReason.reason} | Timeout: ${timeoutMs}ms`
  );

  // ── 9. Construct Structured Inference Trace (Component A & D) ────────────
  const inferenceTrace: InferenceTrace = {
    intent: intent.label,
    memory_used: memoryIntelligenceReport?.compressed_context || [],
    rag_used: !!toolResult || !!weatherResult,
    tools_used: toolTriggered ? [toolTriggered] : [],
    final_prompt: JSON.stringify(finalPromptMessages),
    model_response: "", // Will be set on complete generation
    performance: {
      latency_estimate: optProfile.latency_estimate_ms,
      optimization_path_used: optProfile.path,
      token_budget_used: optProfile.token_budget,
      cache_hits: getCacheHits()
    }
  };

  let connectionTimeout: any = null;
  try {
    const connectionController = new AbortController();
    connectionTimeout = setTimeout(() => {
      connectionController.abort();
    }, timeoutMs);

    const signals: AbortSignal[] = [connectionController.signal];
    if (signal) signals.push(signal);
    const combinedSignal = AbortSignal.any(signals);

    const res = await fetch(`${process.env.NEXT_PUBLIC_OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolvedModel,
        messages: finalPromptMessages,
        options: {
          temperature: intent.isGreeting ? 0.7 : (intent.isCodeGen ? 0.2 : 0.45),
          repeat_penalty: 1.18,
          num_predict: 1000,
          num_thread: 4
        },
        stream: true
      }),
      signal: combinedSignal
    });

    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    console.log(`[Orchestrator] Ollama Response status: ${res.status} ${res.statusText}`);

    if (res.ok && res.body) {
      return {
        response: "",
        stream: res.body,
        toolTriggered,
        toolResult,
        memorySaved,
        allocatedModel: targetModel,
        resolvedModel,
        routingReason,
        inferenceTrace
      };
    }

    const errText = await res.text().catch(() => "N/A");
    console.error(`[Orchestrator] Ollama error: ${errText}`);
  } catch (e: any) {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    if (e.name === "AbortError" && signal?.aborted) {
      console.log(`[Orchestrator] Stream cancelled by user.`);
      streamSessionManager.releaseSessionModel(sessionId);
      throw e;
    }
    console.warn(`[Orchestrator] Ollama unavailable — using graceful fallback. Error: ${e.message || e}`);
  }

  // ── 10. Graceful Offline Fallback (Component A) ──────────────────────────
  if (isSelfManagedTelemetry) {
    telemetry.endSession(requestId, {
      query: message,
      promptSize: Math.ceil(systemPrompt.length / 4),
      responseSize: 0,
      sessionId
    });
  }

  streamSessionManager.releaseSessionModel(sessionId);

  const fallbackText = generateGracefulFallback(message);
  inferenceTrace.model_response = fallbackText;

  return {
    response: fallbackText,
    toolTriggered,
    toolResult,
    memorySaved,
    allocatedModel: targetModel,
    resolvedModel,
    routingReason,
    inferenceTrace
  };
}
