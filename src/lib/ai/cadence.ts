/**
 * Response Cadence Controller — Antgravity v2
 *
 * Tailors instructions to guide response length, structure, and style.
 */

export interface CadenceConfig {
  instructions: string;
  maxOutputTokens: number;
}

export function determineCadence(query: string): CadenceConfig {
  const lower = query.toLowerCase();

  // 1. Coding or scripting requests
  const codingKeywords = ["code", "function", "program", "script", "typescript", "javascript", "css", "html", "react"];
  const isCodeRequest = codingKeywords.some(kw => lower.includes(kw));

  if (isCodeRequest) {
    return {
      instructions: "Format all code inside clean markdown blocks with syntax highlighting. Use clear variable names and keep explanations to a minimum.",
      maxOutputTokens: 800
    };
  }

  // 2. Simple greetings
  const greetingKeywords = ["hi", "hello", "hey", "hlo", "yo", "sup", "welcome"];
  const isGreeting = greetingKeywords.some(kw => lower.startsWith(kw));
  if (isGreeting && query.length < 15) {
    return {
      instructions: "Keep the response extremely short, warm, and friendly (one sentence).",
      maxOutputTokens: 50
    };
  }

  // 3. Creative writing (poems, stories, jokes)
  const creativeKeywords = ["poem", "story", "joke", "funny", "song", "rhyme", "write a", "creative"];
  const isCreative = creativeKeywords.some(kw => lower.includes(kw));
  if (isCreative) {
    return {
      instructions: "Be highly expressive and creative. Use engaging language and format lines/paragraphs standard for creative writing.",
      maxOutputTokens: 500
    };
  }

  // 4. Complex concepts requiring structured layouts (e.g. lists, lists of points)
  const structuralKeywords = ["explain", "list", "how to", "why did", "steps", "guide", "difference between"];
  const isStructured = structuralKeywords.some(kw => lower.includes(kw));

  if (isStructured) {
    return {
      instructions: "Use bullet points, bold sections, and short paragraphs. Make the text highly scannable.",
      maxOutputTokens: 400
    };
  }

  // 5. Default direct cadence
  return {
    instructions: "Respond in 2-3 direct sentences. Lead with the most important facts immediately.",
    maxOutputTokens: 250
  };
}
