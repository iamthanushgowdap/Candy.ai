import { supabase } from "@/lib/supabaseClient";
import { getEmbedding } from "./embeddings";
import { withRecovery } from "./recovery";

export interface CleanReport {
  auditedCount: number;
  deletedCount: number;
  mergedCount: number;
  newMergedCreatedCount: number;
  details: string[];
}

/**
 * Calculates mathematical priority for a memory based on importance, age, and usage count.
 * Formula: Priority = Importance * (0.3 + 0.7 * 0.5^(AgeDays/7)) * (1 + UsageCount/10)
 */
export function calculatePriority(importance: number, createdAt: string, usageCount: number): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const recencyFactor = 0.3 + 0.7 * Math.pow(0.5, ageDays / 7);
  const usageFactor = 1 + (usageCount / 10);
  return importance * recencyFactor * usageFactor;
}

/**
 * Computes Jaccard Similarity index based on shared word tokens (ignoring short stopwords).
 */
export function calculateJaccardSimilarity(txtA: string, txtB: string): number {
  const stopwords = new Set(["with", "this", "that", "from", "they", "them", "then", "their", "there"]);
  const tokenize = (t: string) =>
    t.toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopwords.has(w));

  const wordsA = new Set(tokenize(txtA));
  const wordsB = new Set(tokenize(txtB));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}

/**
 * Invokes local LLM (qwen2.5:0.5b or dynamic active) to synthesize similar memories into a single declarative statement.
 */
async function mergeMemoriesWithLLM(memories: string[]): Promise<string> {
  const bulletPoints = memories.map(m => `- ${m}`).join("\n");
  const prompt = `System Directive: Merge the following overlapping and similar conversational memories into a single, clean, concise, third-person declarative fact. Do not repeat facts. Ensure no information is lost. Do not include introductory phrases, greetings, or chat responses. Return only the final merged declarative statement.

Memories to Merge:
${bulletPoints}

Merged Fact:`;

  return await withRecovery(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000); // 12s timeout

      const res = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:0.5b",
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1,
            num_thread: 4
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) throw new Error(`Ollama returned status ${res.status}`);
      const data = await res.json();
      return data.response?.trim() || "";
    },
    "",
    { context: "MemoryMergeLLM", timeoutMs: 13000 }
  );
}

/**
 * Memory Decay & Cleaning Daemon (Phase 3)
 * Deletes low-signal memories and merges overlapping memories.
 */
export async function runMemoryCleaning(dryRun: boolean = false): Promise<CleanReport> {
  const report: CleanReport = {
    auditedCount: 0,
    deletedCount: 0,
    mergedCount: 0,
    newMergedCreatedCount: 0,
    details: []
  };

  try {
    console.log(`[MemoryCleaner] Starting memory lifecycle cleaning job (DryRun: ${dryRun})...`);
    report.details.push(`Started memory lifecycle cleaning job at ${new Date().toISOString()}`);

    // 1. Fetch all global memories
    const { data: memories, error } = await supabase
      .from("candy_memories")
      .select("id, memory_text, layer, importance, usage_count, created_at");

    if (error) {
      throw new Error(`Failed to fetch memories: ${error.message}`);
    }

    if (!memories || memories.length === 0) {
      report.details.push("No memories found in database.");
      return report;
    }

    report.auditedCount = memories.length;
    report.details.push(`Fetched ${memories.length} total memories from database.`);

    // 2. Identify low-signal memories for deletion
    const toDeleteIds: string[] = [];
    const activeMemories: typeof memories = [];

    for (const mem of memories) {
      const importance = Number(mem.importance ?? 1.0);
      const usageCount = Number(mem.usage_count ?? 0);
      const createdAt = mem.created_at || new Date().toISOString();

      const priority = calculatePriority(importance, createdAt, usageCount);

      if (priority < 0.15 && usageCount === 0) {
        toDeleteIds.push(mem.id);
        report.deletedCount++;
        report.details.push(`Low-signal deletion: "${mem.memory_text}" (Priority: ${priority.toFixed(3)}, Usage: ${usageCount})`);
      } else {
        activeMemories.push(mem);
      }
    }

    // Execute low-signal deletions
    if (!dryRun && toDeleteIds.length > 0) {
      const { error: delError } = await supabase
        .from("candy_memories")
        .delete()
        .in("id", toDeleteIds);

      if (delError) {
        console.error(`[MemoryCleaner] Error deleting low-signal memories:`, delError);
        report.details.push(`Failed to delete low-signal memories: ${delError.message}`);
      } else {
        report.details.push(`Successfully purged ${toDeleteIds.length} low-signal memories from database.`);
      }
    } else if (dryRun && toDeleteIds.length > 0) {
      report.details.push(`[Dry Run] Would purge ${toDeleteIds.length} low-signal memories.`);
    }

    // 3. Group and compress overlapping memories (Jaccard similarity > 0.60)
    const visited = new Set<string>();
    const groups: Array<typeof memories> = [];

    for (let i = 0; i < activeMemories.length; i++) {
      const memA = activeMemories[i];
      if (visited.has(memA.id)) continue;

      const currentGroup = [memA];
      visited.add(memA.id);

      for (let j = i + 1; j < activeMemories.length; j++) {
        const memB = activeMemories[j];
        if (visited.has(memB.id)) continue;

        const similarity = calculateJaccardSimilarity(memA.memory_text, memB.memory_text);
        if (similarity > 0.60) {
          currentGroup.push(memB);
          visited.add(memB.id);
        }
      }

      if (currentGroup.length > 1) {
        groups.push(currentGroup);
      }
    }

    report.details.push(`Identified ${groups.length} overlapping memory groups for semantic merging.`);

    // Process each overlapping group
    for (const group of groups) {
      const groupTexts = group.map(m => m.memory_text);
      report.details.push(`Merging similar group: [${groupTexts.join(" | ")}]`);

      let mergedText = "";
      try {
        mergedText = await mergeMemoriesWithLLM(groupTexts);
      } catch (err: any) {
        console.error(`[MemoryCleaner] Failed to merge group:`, err);
        report.details.push(`Ollama merge failed for group: ${err.message || err}`);
        continue;
      }

      if (!mergedText || mergedText.length < 5) {
        report.details.push(`Skipping group merge - local LLM returned invalid merged text.`);
        continue;
      }

      report.details.push(`-> Merged Result: "${mergedText}"`);

      // Determine aggregated metadata for the new merged memory
      const maxImportance = Math.max(...group.map(m => Number(m.importance ?? 1.0)));
      const sumUsageCount = group.reduce((acc, m) => acc + Number(m.usage_count ?? 0), 0);
      const layers = group.map(m => m.layer);
      // Select layer (prefer long_term, otherwise first in list)
      const targetLayer = layers.includes("long_term") ? "long_term" : layers[0] || "long_term";

      if (!dryRun) {
        try {
          const embedding = await getEmbedding(mergedText);

          // Save new merged memory
          const { error: insertError } = await supabase
            .from("candy_memories")
            .insert({
              memory_text: mergedText,
              embedding,
              layer: targetLayer,
              importance: maxImportance,
              usage_count: sumUsageCount
            });

          if (insertError) {
            console.error(`[MemoryCleaner] Merged insert error:`, insertError);
            report.details.push(`Failed to insert merged memory: ${insertError.message}`);
            continue;
          }

          report.newMergedCreatedCount++;

          // Delete obsolete overlapping original memories
          const obsoleteIds = group.map(m => m.id);
          const { error: obsoleteDelError } = await supabase
            .from("candy_memories")
            .delete()
            .in("id", obsoleteIds);

          if (obsoleteDelError) {
            console.error(`[MemoryCleaner] Obsolete deletion error:`, obsoleteDelError);
            report.details.push(`Warning: failed to delete obsolete overlapping original memories: ${obsoleteDelError.message}`);
          } else {
            report.mergedCount += group.length;
            report.details.push(`Successfully replaced ${group.length} obsolete memories with the newly merged declarative fact.`);
          }

        } catch (err: any) {
          console.error(`[MemoryCleaner] Error in db storage for merged memory:`, err);
          report.details.push(`DB error during group swap: ${err.message || err}`);
        }
      } else {
        report.details.push(`[Dry Run] Would merge ${group.length} items into: "${mergedText}"`);
        report.newMergedCreatedCount++;
        report.mergedCount += group.length;
      }
    }

    report.details.push(`Memory cleaning process completed at ${new Date().toISOString()}. Purged: ${report.deletedCount}, Merged: ${report.mergedCount} items into ${report.newMergedCreatedCount} new facts.`);
    console.log(`[MemoryCleaner] Finished cleaning job. Deleted: ${report.deletedCount}, Merged: ${report.mergedCount}`);

  } catch (err: any) {
    console.error(`[MemoryCleaner] Unexpected cleaner exception:`, err);
    report.details.push(`Fatal Error in cleaner daemon: ${err.message || err}`);
  }

  return report;
}
