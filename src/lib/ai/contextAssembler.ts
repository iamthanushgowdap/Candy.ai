/**
 * Context Assembler — Unified Context Pipeline
 *
 * Responsible for retrieving, ranking, deduplicating, and budget-capping
 * all context pieces before they enter the final prompt.
 *
 * Pulls from: semantic memories, search results, weather, behavioral profile.
 * Output: a clean, prioritized, token-budgeted string[] for prompt injection.
 */

import { rankContext, ContextItem } from "./contextRanker";
import { rerankSearchSnippets, SearchFact } from "./reranker";
import { runTool } from "./tools";
import { searchCache } from "./cache";
import { telemetry } from "./metrics";
import { withRecovery } from "./recovery";
import { getBehavioralPromptSnippet } from "./behavioralMemory";
import { IntentResult } from "./intentClassifier";
import { retrieveAndRankMemories, MemoryIntelligenceResult } from "./memoryIntelligence";
import { OptimizationProfile, incrementSearchCacheHits } from "./performanceOptimizer";

export interface AssembledContext {
  contextStrings: string[];
  toolTriggered?: string;
  toolResult?: string;
  weatherResult?: string;
  memoryIntelligenceReport?: MemoryIntelligenceResult;
}

export interface AssemblerOptions {
  sessionId: string;
  message: string;
  intent: IntentResult;
  requestId: string;
  chatHistory?: { role: string; content: string }[];
  signal?: AbortSignal;
  maxContextTokens?: number;
  prefetchedSearch?: string;
  prefetchedWeather?: string;
  optimizationProfile?: OptimizationProfile;
}

export async function assembleContext(opts: AssemblerOptions): Promise<AssembledContext> {
  const { message, intent, requestId, optimizationProfile, chatHistory } = opts;
  // Use token budget from performance optimization profile or fallback
  const maxTokens = optimizationProfile?.token_budget ?? opts.maxContextTokens ?? 800;

  let toolTriggered: string | undefined;
  let toolResult: string | undefined;
  let weatherResult: string | undefined;

  // ── 1. Parallel: Semantic Memory + Web Search ─────────────────────────────

  if (opts.prefetchedSearch) {
    toolTriggered = "searchWeb";
    toolResult = opts.prefetchedSearch;
  }

  // Enforce memory step (NEVER skipped as per Rule A)
  // Smart Memory Ranking & Summarization (Rule C)
  const memoryPromise = withRecovery(
    async () => {
      if (intent.isGreeting) {
        return { ranked_memory_list: [], compressed_context: [], injected_prompt_section: "", memory_score: 0 } as MemoryIntelligenceResult;
      }
      const recalledIntel = await retrieveAndRankMemories(message, opts.sessionId, 5);
      telemetry.mark(requestId, "memoryDuration");
      return recalledIntel;
    },
    { ranked_memory_list: [], compressed_context: [], injected_prompt_section: "", memory_score: 0 } as MemoryIntelligenceResult,
    { context: "MemoryIntelligence", timeoutMs: 3000 }
  );

  const searchPromise = opts.prefetchedSearch !== undefined
    ? Promise.resolve(opts.prefetchedSearch)
    : withRecovery(
        async () => {
          // Avoid unnecessary RAG calls for simple/medium queries (Rule D)
          if (optimizationProfile?.skip_search || !intent.needsWebSearch) return "";

          let cleanedQuery = message
            .replace(/(search the web for|google|search for|tell me about)/gi, "")
            .trim() || message;
            
          // Contextual query expansion for short follow-up questions
          if (chatHistory && chatHistory.length > 0 && cleanedQuery.split(/\s+/).length <= 8) {
            const recentMsgs = chatHistory.slice(-2).map(m => m.content).join(" ");
            const properNouns = recentMsgs.match(/\b[A-Z][a-z]+\b/g) || [];
            
            const freq: Record<string, number> = {};
            properNouns.forEach(n => {
              if(!/^(The|This|That|There|They|What|Why|How|When|Where|Yes|No|I|It|If|We|You|He|She|In|On|At|To|And|Or|But|Is|Are|Am|A|An|As)$/i.test(n)) {
                freq[n] = (freq[n] || 0) + 1;
              }
            });
            
            const sortedKeywords = Object.entries(freq).sort((a,b) => b[1]-a[1]).map(e => e[0]).slice(0, 2);
            if (sortedKeywords.length > 0) {
               cleanedQuery = `${cleanedQuery} ${sortedKeywords.join(" ")}`;
               console.log(`[ContextAssembler] Expanded search query with context: "${cleanedQuery}"`);
            }
          }

          const cached = await searchCache.get<string>(cleanedQuery);
          if (cached) {
            console.log(`[ContextAssembler Cache] Hit: "${cleanedQuery}"`);
            incrementSearchCacheHits();
            return cached;
          }

          toolTriggered = "searchWeb";
          const rawResult = await runTool("searchWeb", { query: cleanedQuery });
          telemetry.mark(requestId, "searchDuration");

          try {
            const parsedResults: SearchFact[] = JSON.parse(rawResult);
            const reranked = rerankSearchSnippets(cleanedQuery, parsedResults, 3);
            const compressed = JSON.stringify(reranked, null, 2);
            searchCache.set(cleanedQuery, compressed);

            // Background memory ingestion of top result
            if (reranked.length > 0 && reranked[0].snippet.length > 10) {
              import("./memory").then(({ storeSemanticMemory }) => {
                storeSemanticMemory(`Search Fact [${reranked[0].title}]: ${reranked[0].snippet}`)
                  .catch(() => {});
              });
            }

            toolResult = compressed;
            return compressed;
          } catch {
            return rawResult;
          }
        },
        "",
        { context: "WebSearch", timeoutMs: 5000 }
      );

  const [memoryIntel, searchContextStr] = await Promise.all([memoryPromise, searchPromise]);

  // ── 2. Weather (sequential, intent-gated) ────────────────────────────────
  if (intent.needsWeather && !optimizationProfile?.skip_weather) {
    toolTriggered = "getWeather";
    weatherResult = opts.prefetchedWeather !== undefined
      ? opts.prefetchedWeather
      : await withRecovery(
          () => runTool("getWeather", { location: message }),
          "",
          { context: "Weather", timeoutMs: 4000 }
        );
  }

  // ── 3. Build Candidate Context Items ────────────────────────────────────

  const candidates: ContextItem[] = [];

  memoryIntel.compressed_context.forEach((text, i) => {
    candidates.push({ id: `mem-${i}`, text, type: "memory" });
  });

  if (searchContextStr) {
    try {
      const parsedSearch: SearchFact[] = JSON.parse(searchContextStr);
      parsedSearch.forEach((fact, i) => {
        candidates.push({
          id: `search-${i}`,
          text: `${fact.title}: ${fact.snippet}`,
          type: "search_fact"
        });
      });
    } catch {
      if (searchContextStr.length > 10) {
        candidates.push({ id: "search-raw", text: searchContextStr, type: "search_fact" });
      }
    }
  }

  if (weatherResult) {
    candidates.push({ id: "weather", text: weatherResult, type: "memory" });
  }

  // ── 4. Behavioral Snippet (always high priority) ─────────────────────────
  const behaviorSnippet = getBehavioralPromptSnippet(opts.sessionId);

  // ── 5. Rank and Budget ───────────────────────────────────────────────────
  const prioritized = rankContext(message, candidates, 4);

  // Rough token estimate: 1 token ≈ 4 chars
  let tokenBudget = maxTokens;
  const contextStrings: string[] = [];

  if (behaviorSnippet) {
    contextStrings.push(behaviorSnippet);
    tokenBudget -= Math.ceil(behaviorSnippet.length / 4);
  }

  for (const item of prioritized) {
    const cost = Math.ceil(item.text.length / 4);
    if (cost > tokenBudget) break;
    contextStrings.push(item.text);
    tokenBudget -= cost;
  }

  return {
    contextStrings,
    toolTriggered,
    toolResult,
    weatherResult,
    memoryIntelligenceReport: memoryIntel
  };
}
