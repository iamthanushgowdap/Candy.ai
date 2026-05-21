/**
 * Global AI Memory Manager — Antgravity v2
 * Performs vector similarity search, computes embeddings, and stores/queries
 * multi-layered global semantic recollections in Supabase.
 */

import { supabase } from "@/lib/supabaseClient";
import { getEmbedding } from "./embeddings";
import { LIGHTWEIGHT_MODEL, resolveRoutedModel } from "./modelRouter";

export type MemoryLayer = "short_term" | "long_term" | "episodic" | "behavioral";

export interface MemoryItem {
  id: string;
  memory_text: string;
  layer: MemoryLayer;
  importance: number;
  similarity?: number;
  created_at?: string;
}

/**
 * Perform a global vector similarity search on Supabase memories
 * Supports layer-specific filtering and time-decay for short-term memories.
 */
export async function querySemanticMemories(
  queryText: string,
  limit: number = 5,
  layer?: MemoryLayer
): Promise<string[]> {
  try {
    const vector = await getEmbedding(queryText);
    
    // Call match_global_memories_v2 RPC which supports layer filtering
    const { data, error } = await supabase.rpc("match_global_memories_v2", {
      query_embedding: vector,
      match_threshold: 0.12, // Lowered threshold for local nomic embeddings
      match_count: limit * 3, // Fetch more to allow decay/importance ranking
      filter_layer: layer || null
    });

    if (error) {
      console.warn("match_global_memories_v2 RPC error. Falling back to keyword search:", error);
      return await getKeywordMemories(queryText, limit, layer);
    }

    if (data && data.length > 0) {
      const items: MemoryItem[] = data.map((m: any) => ({
        id: m.id,
        memory_text: m.memory_text,
        layer: m.layer as MemoryLayer,
        importance: Number(m.importance || 1.0),
        similarity: m.similarity,
        created_at: m.created_at
      }));

      // Apply highly refined decay and importance scoring
      const scored = items.map(item => {
        let score = (item.similarity || 0) * item.importance;

        if (item.created_at) {
          const ageHours = (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60);
          
          if (item.layer === "short_term") {
            // Decay by half every 12 hours (rapid decay for active threads/recent tasks)
            const decay = Math.pow(0.5, ageHours / 12);
            score *= decay;
          } else if (item.layer === "episodic") {
            // Soft decay by half every 7 days (slow decay for overall narrative summaries)
            const decay = Math.pow(0.5, ageHours / (24 * 7));
            score *= decay;
          }
        }

        return { text: item.memory_text, score };
      });

      // Semantic deduplication
      const uniqueResults: string[] = [];
      const sortedScored = scored.sort((a, b) => b.score - a.score);

      for (const item of sortedScored) {
        const cleanedItem = item.text.trim().toLowerCase();
        const isDuplicate = uniqueResults.some(existing => {
          const cleanExisting = existing.trim().toLowerCase();
          // Jaccard similarity fallback or simple substring matches
          if (cleanExisting.includes(cleanedItem) || cleanedItem.includes(cleanExisting)) return true;
          
          // Overlap of words
          const w1 = new Set(cleanExisting.split(/\s+/));
          const w2 = new Set(cleanedItem.split(/\s+/));
          const intersection = [...w1].filter(x => w2.has(x)).length;
          const union = w1.size + w2.size - intersection;
          return union > 0 && (intersection / union) > 0.65;
        });

        if (!isDuplicate) {
          uniqueResults.push(item.text);
          if (uniqueResults.length >= limit) break;
        }
      }

      return uniqueResults;
    }
  } catch (err) {
    console.error("Semantic query failed:", err);
  }

  return await getKeywordMemories(queryText, limit, layer);
}

/**
 * Fallback keyword match in case pgvector RPC throws an error
 */
async function getKeywordMemories(
  queryText: string,
  limit: number = 5,
  layer?: MemoryLayer
): Promise<string[]> {
  try {
    let query = supabase
      .from("candy_memories")
      .select("memory_text, layer, importance, created_at")
      .order("created_at", { ascending: false });

    if (layer) {
      query = query.eq("layer", layer);
    }

    const { data } = await query.limit(50);
    if (!data) return [];

    const keywords = queryText.toLowerCase().split(/\s+/).filter(k => k.length > 3);
    
    const scored = data.map(m => {
      let score = 0;
      const txt = m.memory_text.toLowerCase();
      for (const word of keywords) {
        if (txt.includes(word)) score += 1.5;
      }

      score *= Number(m.importance || 1.0);

      if (m.created_at) {
        const ageHours = (Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60);
        if (m.layer === "short_term") {
          score *= Math.pow(0.5, ageHours / 12);
        } else if (m.layer === "episodic") {
          score *= Math.pow(0.5, ageHours / (24 * 7));
        }
      }

      return { text: m.memory_text, score };
    });

    const uniqueResults: string[] = [];
    const sorted = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);

    for (const item of sorted) {
      if (!uniqueResults.some(ex => ex.toLowerCase().includes(item.text.toLowerCase()))) {
        uniqueResults.push(item.text);
        if (uniqueResults.length >= limit) break;
      }
    }

    return uniqueResults;
  } catch (err) {
    console.error("Keyword fallback search failed:", err);
    return [];
  }
}

/**
 * Store a new semantic memory with computed embedding vector, layer, and importance.
 */
export async function storeSemanticMemory(
  text: string,
  layer: MemoryLayer = "long_term",
  importance: number = 1.0
): Promise<boolean> {
  if (!text || text.trim().length < 5) return false;

  try {
    const cleanText = text.trim();
    
    // Check for exact or highly similar duplicates in Supabase
    const { data: existing } = await supabase
      .from("candy_memories")
      .select("id, memory_text")
      .eq("layer", layer)
      .limit(30);

    if (existing && existing.length > 0) {
      const isDuplicate = existing.some(item => {
        const existingNorm = item.memory_text.toLowerCase();
        const newNorm = cleanText.toLowerCase();
        if (existingNorm === newNorm) return true;
        // Check string overlap
        const minLen = Math.min(existingNorm.length, newNorm.length);
        if (minLen > 25 && (existingNorm.includes(newNorm) || newNorm.includes(existingNorm))) {
          return true;
        }
        return false;
      });

      if (isDuplicate) {
        console.log(`[Memory] Duplicate memory skipped: "${cleanText}"`);
        return true;
      }
    }

    const vector = await getEmbedding(cleanText);
    const { error } = await supabase.from("candy_memories").insert({
      memory_text: cleanText,
      embedding: vector,
      layer,
      importance
    });

    if (!error) {
      // Clean up/prune old memories if count grows too high (> 200 items in behavioral or short_term)
      pruneLayerMemories(layer).catch(() => {});
      return true;
    }
    console.error("Failed to insert memory vector:", error);
  } catch (err) {
    console.error("Memory storage exception:", err);
  }
  return false;
}

/**
 * Prune lowest importance/oldest memories in a layer to prevent database bloating
 */
async function pruneLayerMemories(layer: MemoryLayer): Promise<void> {
  try {
    const { count } = await supabase
      .from("candy_memories")
      .select("*", { count: "exact", head: true })
      .eq("layer", layer);

    const maxItems = layer === "short_term" ? 150 : layer === "behavioral" ? 80 : 300;
    if (count && count > maxItems) {
      // Fetch bottom 20 memories by importance and age
      const { data: oldItems } = await supabase
        .from("candy_memories")
        .select("id")
        .eq("layer", layer)
        .order("importance", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(20);

      if (oldItems && oldItems.length > 0) {
        const ids = oldItems.map(x => x.id);
        await supabase.from("candy_memories").delete().in("id", ids);
        console.log(`[Memory Pruner] Pruned ${ids.length} low-importance memories from layer: ${layer}`);
      }
    }
  } catch (e) {
    // Fail silently in background
  }
}

/**
 * Structured LLM extraction details
 */
export interface ExtractedFact {
  text: string;
  layer: MemoryLayer;
  importance: number;
}

/**
 * Run background LLM call to extract declarative memories with dynamic layers and importance
 */
export async function extractMemoriesWithLLM(message: string): Promise<ExtractedFact[]> {
  try {
    const resolvedModel = await resolveRoutedModel(LIGHTWEIGHT_MODEL);
    const prompt = `You are an advanced AI memory layer manager. Extract facts, permanent preferences, episodic context, or behavioral cues from the user's message.
Message: "${message}"

Output ONLY a JSON array of extracted fact objects matching this TypeScript interface:
interface ExtractedFact {
  text: string; // declarative 3rd-person statements (e.g. "User is building a clothes landing page", "User values concise visual diagrams")
  layer: "short_term" | "long_term" | "episodic" | "behavioral";
  importance: number; // float between 0.1 and 1.0 indicating memory impact
}

Return an empty array [] if no new declarative insights are contained in the user's statement. No conversational filler or surrounding markdown blocks.`;

    const res = await fetch(`${process.env.NEXT_PUBLIC_OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: "user", content: prompt }
        ],
        options: {
          temperature: 0.1,
          num_predict: 180
        },
        stream: false
      }),
      signal: AbortSignal.timeout(3500)
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.message?.content || "";
      const match = content.match(/\[[\s\S]*?\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => ({
            text: String(item.text || "").trim(),
            layer: (item.layer === "short_term" || item.layer === "long_term" || item.layer === "episodic" || item.layer === "behavioral" ? item.layer : "long_term") as MemoryLayer,
            importance: Math.min(1.0, Math.max(0.1, Number(item.importance || 0.7)))
          })).filter(x => x.text.length > 5);
        }
      }
    }
  } catch (e) {
    // Ignore background errors
  }
  return [];
}

/**
 * Parse messages in real-time for factual user statements and index them
 */
export async function extractAndStoreMemory(text: string): Promise<string | null> {
  const lowercaseMsg = text.toLowerCase();
  const patterns = [
    { trigger: "my name is", extractor: (s: string) => `User's name is ${s}`, layer: "long_term" as MemoryLayer, importance: 1.0 },
    { trigger: "i work as", extractor: (s: string) => `User works as a ${s}`, layer: "long_term" as MemoryLayer, importance: 0.8 },
    { trigger: "i am a", extractor: (s: string) => `User is a ${s}`, layer: "long_term" as MemoryLayer, importance: 0.7 },
    { trigger: "i love", extractor: (s: string) => `User loves ${s}`, layer: "short_term" as MemoryLayer, importance: 0.6 },
    { trigger: "my favorite", extractor: (s: string) => `User's favorite item is ${s}`, layer: "short_term" as MemoryLayer, importance: 0.6 },
    { trigger: "i live in", extractor: (s: string) => `User lives in ${s}`, layer: "long_term" as MemoryLayer, importance: 0.9 },
    { trigger: "i hate", extractor: (s: string) => `User hates ${s}`, layer: "short_term" as MemoryLayer, importance: 0.5 },
    { trigger: "i feel", extractor: (s: string) => `User feels ${s}`, layer: "short_term" as MemoryLayer, importance: 0.4 },
    { trigger: "remember that", extractor: (s: string) => `User preference: ${s}`, layer: "long_term" as MemoryLayer, importance: 0.9 },
    { trigger: "remember i", extractor: (s: string) => `User fact: I ${s}`, layer: "long_term" as MemoryLayer, importance: 0.9 }
  ];

  let triggeredFact: string | null = null;

  for (const { trigger, extractor, layer, importance } of patterns) {
    if (lowercaseMsg.includes(trigger)) {
      const parts = lowercaseMsg.split(trigger);
      if (parts[1]) {
        const factText = parts[1].trim().split(/[.!?]/)[0];
        if (factText && factText.length > 2 && factText.length < 80) {
          const formattedFact = extractor(factText);
          const saved = await storeSemanticMemory(formattedFact, layer, importance);
          if (saved) triggeredFact = formattedFact;
        }
      }
    }
  }

  // Dynamic LLM-powered multi-layer factual preference extraction
  try {
    const llmMemories = await extractMemoriesWithLLM(text);
    if (llmMemories.length > 0) {
      for (const mem of llmMemories) {
        await storeSemanticMemory(mem.text, mem.layer, mem.importance);
      }
      const factList = llmMemories.map(m => `[${m.layer}] ${m.text}`);
      return triggeredFact ? `${triggeredFact} | ${factList.join(" | ")}` : factList.join(" | ");
    }
  } catch (e) {
    // Fail silently in background
  }

  return triggeredFact;
}
