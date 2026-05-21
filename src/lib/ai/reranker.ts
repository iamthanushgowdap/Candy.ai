/**
 * Search Snippet Reranker & Compressor — Antgravity v2
 *
 * Scores search snippets using keyword matching, domain authority,
 * and content novelty.
 */

export interface SearchFact {
  title: string;
  snippet: string;
  url: string;
  score?: number;
}

const HIGH_QUALITY_DOMAINS = [
  "wikipedia.org", "github.com", "stackoverflow.com", "medium.com",
  "dev.to", "npmjs.com", "mozilla.org", "w3schools.com", "react.dev",
  "nextjs.org", "rust-lang.org", "python.org", "microsoft.com",
  "reddit.com", "nytimes.com", "reuters.com", "bloomberg.com"
];

const BOILERPLATE_WORDS = [
  "cookie", "login", "password reset", "terms of service", "privacy policy",
  "subscribe", "sign up", "all rights reserved", "click here"
];

export function rerankSearchSnippets(
  query: string,
  rawSnippets: SearchFact[],
  limit: number = 3
): SearchFact[] {
  if (rawSnippets.length === 0) return [];

  // Filter query tokens (include short terms like "api", "git", "cli")
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= 3);

  const seenSnippets = new Set<string>();

  const scored = rawSnippets
    .map(fact => {
      let score = 0;
      const snippetLower = fact.snippet.toLowerCase();
      const titleLower = fact.title.toLowerCase();

      // Snippet validation
      if (!fact.snippet || fact.snippet.length < 15) {
        return { ...fact, score: -1 };
      }

      // Exact phrase match bonus
      if (snippetLower.includes(query.toLowerCase())) {
        score += 8;
      }

      // Keyword match counts
      for (const token of queryTokens) {
        if (snippetLower.includes(token)) score += 3;
        if (titleLower.includes(token)) score += 1.5;
      }

      // Domain authority bonus
      try {
        const urlObj = new URL(fact.url);
        const host = urlObj.hostname.replace("www.", "");
        const isHighQuality = HIGH_QUALITY_DOMAINS.some(domain => host.endsWith(domain));
        if (isHighQuality) {
          score += 3;
        }
      } catch {}

      // Boilerplate penalty
      for (const word of BOILERPLATE_WORDS) {
        if (snippetLower.includes(word)) {
          score -= 4;
        }
      }

      // Similarity / redundancy penalty (within results)
      const first15Chars = snippetLower.slice(0, 15);
      if (seenSnippets.has(first15Chars)) {
        score -= 5;
      } else {
        seenSnippets.add(first15Chars);
      }

      return { ...fact, score };
    })
    .filter(fact => (fact.score ?? 0) >= 0);

  // Sort descending by score
  return scored
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}
