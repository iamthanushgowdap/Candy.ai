/**
 * Context Prioritization Engine
 * Scores, ranks, and filters candidate information sources (memories, search facts, profiles) to maximize prompt relevance.
 */

export interface ContextItem {
  id: string;
  text: string;
  type: "memory" | "search_fact" | "profile";
  score?: number;
}

export function rankContext(query: string, items: ContextItem[], limit: number = 5): ContextItem[] {
  if (items.length === 0) return [];

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3)
    .map(w => w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ""));

  const scoredItems = items.map(item => {
    let score = 0;
    const textLower = item.text.toLowerCase();

    // 1. Term Frequency Match (exact matching of search tokens)
    for (const word of queryWords) {
      if (textLower.includes(word)) {
        score += 2.0;
      }
    }

    // 2. Keyword co-occurrence clustering bonus
    const matchedWords = queryWords.filter(word => textLower.includes(word));
    if (matchedWords.length > 1) {
      score += matchedWords.length * 1.5;
    }

    // 3. Source weight priority biasing (Search facts represent latest info, memories represent continuity)
    if (item.type === "search_fact") score += 1.0;
    if (item.type === "memory") score += 0.5;

    return { ...item, score };
  });

  // Sort descending by score and filter out zero-score matches (unless we don't have enough context, then keep some fallback)
  return scoredItems
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}
