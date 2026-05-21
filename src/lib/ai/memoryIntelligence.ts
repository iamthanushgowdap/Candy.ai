import { supabase } from "@/lib/supabaseClient";
import { getEmbedding } from "./embeddings";
import { classifyIntent } from "./intentClassifier";

export type MemoryLayer = "short_term" | "long_term" | "episodic" | "behavioral";

export interface MemoryItem {
  id: string;
  memory_text: string;
  layer: MemoryLayer;
  importance: number;
  similarity: number;
  created_at: string;
  finalScore?: number;
}

export interface MemoryIntelligenceResult {
  ranked_memory_list: MemoryItem[];
  compressed_context: string[];
  injected_prompt_section: string;
  memory_score: number; // Average relevance score of top elements
}

/**
 * Advanced Memory Intelligence Engine (Component C)
 * Pulls, re-ranks, deduplicates, and compresses semantic memories to prevent context overflow.
 */
export async function retrieveAndRankMemories(
  queryText: string,
  sessionId: string,
  limit: number = 5
): Promise<MemoryIntelligenceResult> {
  if (!queryText || queryText.trim().length < 2) {
    return { ranked_memory_list: [], compressed_context: [], injected_prompt_section: "", memory_score: 0 };
  }

  // Instant short-circuit for greetings to minimize latency and skip DB/embedding queries entirely
  if (classifyIntent(queryText).isGreeting) {
    return { ranked_memory_list: [], compressed_context: [], injected_prompt_section: "", memory_score: 0 };
  }

  try {
    // 1. Fetch query embedding
    const queryEmbedding = await getEmbedding(queryText);

    // 2. Fetch top 15 memories to allow for quality re-ranking and decay calculations
    const { data, error } = await supabase.rpc("match_global_memories_v2", {
      query_embedding: queryEmbedding,
      match_threshold: 0.1, // High recall matching threshold
      match_count: 15,
      filter_layer: null
    });

    if (error) {
      console.warn("[MemoryIntel] Supabase RPC failed, using fallback empty recall:", error);
      return { ranked_memory_list: [], compressed_context: [], injected_prompt_section: "", memory_score: 0 };
    }

    if (!data || data.length === 0) {
      return { ranked_memory_list: [], compressed_context: [], injected_prompt_section: "", memory_score: 0 };
    }

    // 3. Map candidates
    const candidates: MemoryItem[] = data.map((m: any) => ({
      id: m.id,
      memory_text: String(m.memory_text || "").trim(),
      layer: (m.layer || "long_term") as MemoryLayer,
      importance: Number(m.importance ?? 1.0),
      similarity: Number(m.similarity ?? 0.5),
      created_at: m.created_at || new Date().toISOString()
    }));

    // 4. Calculate detailed re-ranking scores (Similarity * Importance * RecencyDecay)
    const scoredCandidates = candidates.map(item => {
      const similarityWeight = item.similarity;
      const importanceWeight = item.importance;
      
      // Calculate recency-decay
      let recencyDecay = 1.0;
      if (item.created_at) {
        const ageHours = (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60);
        
        // Define half-life based on memory layer
        const halfLifeHours = item.layer === "short_term" || item.layer === "behavioral" 
          ? 12 // Rapid decay for active/behavioral sessions
          : 168; // Slow decay (7 days) for episodic and long term cross-session facts

        recencyDecay = Math.pow(0.5, ageHours / halfLifeHours);
      }

      // Final score formula: combines similarity, importance, and recency decay
      const finalScore = similarityWeight * (0.6 + 0.4 * importanceWeight) * (0.7 + 0.3 * recencyDecay);

      return { ...item, finalScore };
    });

    // Sort by final score descending
    const sortedCandidates = scoredCandidates.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));

    // 5. Semantic Deduplication (Jaccard + Overlap logic)
    const uniqueMemories: MemoryItem[] = [];
    for (const item of sortedCandidates) {
      if (item.memory_text.length < 5) continue; // Skip very low-quality or empty

      const isDuplicate = uniqueMemories.some(existing => {
        const txtA = existing.memory_text.toLowerCase();
        const txtB = item.memory_text.toLowerCase();

        // 1. Direct inclusion check
        if (txtA.includes(txtB) || txtB.includes(txtA)) return true;

        // 2. Token overlap overlap coefficient
        const wordsA = new Set(txtA.split(/\s+/).filter(w => w.length > 3));
        const wordsB = new Set(txtB.split(/\s+/).filter(w => w.length > 3));
        if (wordsA.size === 0 || wordsB.size === 0) return false;

        let intersection = 0;
        for (const w of wordsA) {
          if (wordsB.has(w)) intersection++;
        }
        const union = wordsA.size + wordsB.size - intersection;
        const jaccard = intersection / union;
        const overlap = intersection / Math.min(wordsA.size, wordsB.size);

        return jaccard > 0.60 || overlap > 0.80; // High overlap indicates duplicate
      });

      if (!isDuplicate) {
        uniqueMemories.push(item);
      }
    }

    // 6. Fact Compression (Compress verbose memories > 120 chars into short declarative facts)
    const compressedMemories = uniqueMemories.map(item => {
      let text = item.memory_text;
      
      // Simple regex compression of verbose helper filler phrases
      if (text.length > 120) {
        text = text
          .replace(/^(as far as i know,|from my understanding,|the user stated that|i recall that|in our last conversation, the user mentioned)/gi, "")
          .replace(/\b(wants to|wishes to|is planning to)\b/gi, "plans to")
          .replace(/\b(stated that|mentioned that|said that)\b/gi, "noted")
          .trim();
        
        // Capitalize first letter
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }

      return {
        ...item,
        memory_text: text
      };
    });

    // 7. Limit injected elements to between 3 and 7
    const topLimit = Math.min(7, Math.max(3, limit));
    const selectedMemories = compressedMemories.slice(0, topLimit);

    // Asynchronously log memory usage stats in the background without blocking main execution thread
    if (selectedMemories.length > 0) {
      const memoryIds = selectedMemories.map(m => m.id);
      (async () => {
        try {
          const { error } = await supabase.rpc("increment_memories_usage", { memory_ids: memoryIds });
          if (error) {
            console.error("[MemoryIntel] Failed to increment memories usage:", error);
          }
        } catch (err) {
          console.error("[MemoryIntel] Error calling increment_memories_usage RPC:", err);
        }
      })();
    }

    // Calculate average score of memory elements
    const totalScore = selectedMemories.reduce((acc, curr) => acc + (curr.finalScore || 0), 0);
    const avgScore = selectedMemories.length > 0 ? totalScore / selectedMemories.length : 0;

    const texts = selectedMemories.map(m => m.memory_text);

    // Build the clean injected prompt section
    const injectedPromptSection = texts.length > 0
      ? `\n[Cognitive Memory Recall]\n${texts.map(t => `• ${t}`).join("\n")}`
      : "";

    return {
      ranked_memory_list: selectedMemories,
      compressed_context: texts,
      injected_prompt_section: injectedPromptSection,
      memory_score: avgScore
    };

  } catch (error) {
    console.error("[MemoryIntel] retrieveAndRankMemories unexpected error:", error);
    return { ranked_memory_list: [], compressed_context: [], injected_prompt_section: "", memory_score: 0 };
  }
}
