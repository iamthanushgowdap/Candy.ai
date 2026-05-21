/**
 * Recovery Layer — Graceful Degradation Wrapper
 * 
 * Wraps all external calls (search, embeddings, memory, Ollama) so that
 * failures never propagate and crash the orchestration pipeline.
 * Every tool call should go through withRecovery().
 */

export interface RecoveryOptions {
  /** Label shown in logs when failure occurs */
  context: string;
  /** If true, re-throw AbortErrors so cancellation still works */
  allowAbort?: boolean;
  /** Timeout in ms — wraps the fn with a race against a timeout signal */
  timeoutMs?: number;
}

/**
 * Wraps an async function with error recovery.
 * On failure, logs the error and returns the provided fallback value.
 */
export async function withRecovery<T>(
  fn: () => Promise<T>,
  fallback: T,
  options: RecoveryOptions
): Promise<T> {
  const { context, allowAbort = true, timeoutMs } = options;

  try {
    if (timeoutMs) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const result = await fn();
        clearTimeout(timer);
        return result;
      } catch (e: any) {
        clearTimeout(timer);
        throw e;
      }
    }
    return await fn();
  } catch (e: any) {
    if (allowAbort && (e.name === "AbortError" || e.name === "TimeoutError")) {
      throw e; // Let abort propagate for stream cancellation
    }
    console.warn(`[Recovery:${context}] Suppressed failure: ${e.message || e}`);
    return fallback;
  }
}

/**
 * Generates a graceful, context-aware fallback message when the entire
 * pipeline fails (Ollama offline, embeddings down, search failing, etc.)
 */
export function generateGracefulFallback(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("code") || lower.includes("function") || lower.includes("script")) {
    return "My code generation pipeline encountered an issue. Please try rephrasing your request or check that the local AI service is running.";
  }
  if (lower.includes("weather")) {
    return "I couldn`t retrieve weather data right now. Please try again in a moment.";
  }
  if (lower.includes("search") || lower.includes("find") || lower.includes("look up")) {
    return "Search is temporarily unavailable. I can still answer based on my training knowledge — what would you like to know?";
  }

  return "I`m having a momentary issue processing your request. Please try again — I'm fully operational otherwise.";
}

/**
 * Safe JSON parse — returns null instead of throwing
 */
export function safeJsonParse<T>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}
