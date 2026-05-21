/**
 * Dynamic Token Budget Manager
 * Calculates string lengths, estimates token counts, and slices context items to keep prompt processing inside comfortable CPU limits.
 */

export interface TokenBudgetAllocation {
  systemPrompt: string;
  chatHistory: { role: "user" | "assistant"; content: string }[];
  retrievedContext: string[];
}

// Helper to estimate tokens (rough character count approximation: ~4 chars per token)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function apportionTokenBudget(
  systemPrompt: string,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  contextItems: string[],
  maxTotalTokens: number = 2000 // Comfort budget for local CPU-bound generation
): TokenBudgetAllocation {
  const systemPromptTokens = estimateTokens(systemPrompt);
  
  const remainingBudget = maxTotalTokens - systemPromptTokens;

  // 1. Allocate 40% of remaining budget to chat history, rest to context
  const historyBudgetLimit = Math.floor(remainingBudget * 0.45);
  const contextBudgetLimit = Math.floor(remainingBudget * 0.55);

  // 2. Process Chat History (most recent messages first)
  const budgetedHistory: { role: "user" | "assistant"; content: string }[] = [];
  let currentHistoryTokens = 0;

  for (let i = chatHistory.length - 1; i >= 0; i--) {
    const msg = chatHistory[i];
    const msgTokens = estimateTokens(msg.content);

    if (currentHistoryTokens + msgTokens <= historyBudgetLimit) {
      budgetedHistory.unshift(msg);
      currentHistoryTokens += msgTokens;
    } else {
      break; // Stop taking older messages
    }
  }

  // 3. Process Retrieved Context Items
  const budgetedContext: string[] = [];
  let currentContextTokens = 0;

  for (const item of contextItems) {
    const itemTokens = estimateTokens(item);
    if (currentContextTokens + itemTokens <= contextBudgetLimit) {
      budgetedContext.push(item);
      currentContextTokens += itemTokens;
    }
  }

  return {
    systemPrompt,
    chatHistory: budgetedHistory,
    retrievedContext: budgetedContext
  };
}
