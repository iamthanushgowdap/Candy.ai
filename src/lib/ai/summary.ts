/**
 * Continuous Conversation Summarizer — Antgravity v2
 *
 * Compresses very long chat logs into episodic memories to prevent prompt bloating
 * and maintain low latencies on local CPU inference.
 */

import { supabase } from "@/lib/supabaseClient";
import { storeSemanticMemory } from "./memory";
import { withRecovery } from "./recovery";

export async function summarizeSession(sessionId: string): Promise<void> {
  try {
    // 1. Fetch all messages in the session
    const { data: messages, error } = await supabase
      .from("candy_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error || !messages) return;

    // Trigger summarization only if message count exceeds 20
    if (messages.length <= 20) return;

    console.log(`[Summary Pipeline] Session ${sessionId} has ${messages.length} messages. Compressing oldest logs...`);

    // 2. Isolate the oldest 10 messages to summarize
    const toSummarize = messages.slice(0, 10);
    
    // Check if we've already summarized these exact messages (avoid duplicates)
    const contentHash = toSummarize.map(m => m.id).join(",");
    
    const conversationText = toSummarize
      .map(m => `${m.sender === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const prompt = `System Directive: Summarize the following conversation segment in 2-3 sentences. Focus strictly on retaining user names, specific facts, project names, preferences, and key topics discussed. Do not add boilerplate.

Conversation Segment:
${conversationText}

Summary:`;

    // 3. Request summary from local Ollama instance with timeout
    const summaryText = await withRecovery(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000); // 8s timeout

        const res = await fetch(`${process.env.NEXT_PUBLIC_OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true", "ngrok-skip-browser-warning": "true" },
          body: JSON.stringify({
            model: "qwen2.5:0.5b", // Standard small model for summarization tasks
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
      { context: "SummarizerOllama", timeoutMs: 9000 }
    );

    if (!summaryText || summaryText.length < 5) {
      console.warn("[Summary Pipeline] Failed to generate valid summary. Skipping compression.");
      return;
    }

    console.log(`[Summary Pipeline] Generated episodic recap: "${summaryText}"`);

    // 4. Save the summary as an episodic memory with high importance
    const saved = await storeSemanticMemory(
      `Conversation Recap [Session: ${sessionId}]: ${summaryText}`,
      "episodic",
      1.0
    );

    if (!saved) {
      console.error("[Summary Pipeline] Failed to store episodic memory. Aborting compression.");
      return;
    }

    // 5. Delete the summarized messages
    const idsToDelete = toSummarize.map(m => m.id);
    const { error: deleteError } = await supabase
      .from("candy_messages")
      .delete()
      .in("id", idsToDelete);

    if (deleteError) {
      console.error("[Summary Pipeline] Error deleting compressed messages:", deleteError);
    } else {
      console.log(`[Summary Pipeline] Successfully compressed and deleted oldest 10 messages.`);
    }
  } catch (e: any) {
    console.error("[Summary Pipeline] Exception in summarizer:", e.message || e);
  }
}
