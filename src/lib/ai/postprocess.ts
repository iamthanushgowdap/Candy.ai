/**
 * Response Post-Processing Layer — v2
 *
 * Strips robotic phrasing, AI refusal patterns, canned filler text,
 * and normalizes markdown formatting for clean, premium output.
 */

/** Full list of known bad opening patterns */
const BAD_OPENERS: RegExp[] = [
  /^sure,?\s*i\s*can\s*help\s*with\s*that[.!]?\s*/i,
  /^here\s*is\s*the\s*information\s*you\s*requested:?\s*/i,
  /^as\s*an\s*ai\s*(?:assistant|language\s*model),?\s*/i,
  /^sure,?\s*here\s*(?:is|are)\s*/i,
  /^hello!?\s*how\s*can\s*i\s*assist\s*you\s*today\??\s*/i,
  /^i`?m\s*sorry,?\s*but\s*as\s*an\s*ai\s*(?:language\s*model|assistant),?\s*/i,
  /^i`?m\s*sorry,?\s*but\s*i\s*(?:don`?t|do\s*not)\s*have\s*the\s*(?:capability|ability)\s*to\s*/i,
  /^unfortunately,?\s*as\s*an\s*ai\s*/i,
  /^i\s*apologize,?\s*but\s*as\s*an\s*ai\s*/i,
  /^of\s*course!?\s*/i,
  /^certainly!?\s*/i,
  /^absolutely!?\s*/i,
  /^great\s*question!?\s*/i,
  /^that`?s\s*a\s*great\s*(?:question|request)!?\s*/i,
  /^i\s*am\s*not\s*able\s*to\s*(?:generate|create|write|produce)\s*/i,
  /^i\s*can`?t\s*(?:generate|create|write|produce)\s*a\s*/i,
  /^sure\s*thing!?\s*/i,
  /^here\s*you\s*go:?\s*/i,
  /^based\s*on\s*the\s*(?:provided\s*)?context,?\s*/i,
  /^according\s*to\s*the\s*(?:provided\s*)?context,?\s*/i,
  /^let`?s\s*(?:dive\s*in|get\s*started|begin)[.!]?\s*/i,
];

/** Bad closing patterns */
const BAD_CLOSERS: RegExp[] = [
  /\s*feel\s*free\s*to\s*(?:ask|let\s*me\s*know)[^.]*[.!]?\s*$/i,
  /\s*don`?t\s*hesitate\s*to\s*(?:ask|reach\s*out)[^.]*[.!]?\s*$/i,
  /\s*hope\s*this\s*helps?!?\s*$/i,
  /\s*let\s*me\s*know\s*if\s*you\s*(?:have|need)[^.]*[.!]?\s*$/i,
  /\s*is\s*there\s*anything\s*else\s*(?:i\s*can\s*help\s*(?:you\s*)?with)?[^.]*[.!]?\s*$/i,
  /\s*happy\s*coding!?\s*$/i,
  /\s*let\s*me\s*know\s*if\s*you\s*(?:need\s*any\s*changes|have\s*questions)[^.]*[.!]?\s*$/i,
];

export function postProcessCompleteText(text: string): string {
  if (!text) return "";

  let cleaned = text.trim();

  // 1. Strip bad openers (check repeatedly for chained openers)
  let changed = true;
  while (changed) {
    changed = false;
    for (const regex of BAD_OPENERS) {
      const next = cleaned.replace(regex, "");
      if (next !== cleaned) {
        cleaned = next.trim();
        changed = true;
        break;
      }
    }
  }

  // 2. Strip bad closers
  for (const regex of BAD_CLOSERS) {
    cleaned = cleaned.replace(regex, "").trim();
  }

  // 3. Normalize multiple blank lines → max one blank line
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // 4. Trim trailing whitespace per line
  cleaned = cleaned.split("\n").map(l => l.trimEnd()).join("\n");

  // 5. Validate markdown code blocks are closed
  const codeBlockCount = (cleaned.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    cleaned += "\n```";
  }

  // 6. Normalize headings (e.g. Ensure space after hashtags: "###Title" -> "### Title")
  cleaned = cleaned.replace(/^(#{1,6})([^\s#])/gm, "$1 $2");

  // 7. Normalize bullet formatting to standard "- "
  cleaned = cleaned.replace(/^[\*\u2022]\s+/gm, "- ");

  // 8. Clean up empty lines inside code blocks
  cleaned = cleaned.replace(/(```[\s\S]*?```)/g, (match) => {
    return match.replace(/\n{2,}/g, "\n");
  });

  // 9. Intelligent Paragraph Splitting & Transition Cleanup
  // Split monolithic paragraphs of > 450 chars at safe sentence bounds
  const paragraphs = cleaned.split("\n\n");
  const processedParagraphs = paragraphs.map(p => {
    // Skip if it is a list item or a code block
    if (p.startsWith("-") || p.startsWith("1.") || p.startsWith("`") || p.startsWith("#")) {
      return p;
    }
    
    // Scrub repetitive robotic transitions
    let temp = p
      .replace(/^(in\s+summary|in\s+conclusion|to\s+conclude|consequently|as\s+a\s+result|therefore|thus),?\s*/i, "")
      .trim();
    
    // Capitalize first letter if transitions were stripped
    if (temp.length > 0) {
      temp = temp.charAt(0).toUpperCase() + temp.slice(1);
    }

    if (temp.length > 450) {
      // Split on period, question mark, or exclamation mark followed by a space
      const sentences = temp.split(/(?<=[.!?])\s+/);
      let chunk = "";
      const result: string[] = [];
      
      for (const sentence of sentences) {
        if ((chunk + " " + sentence).length > 300) {
          if (chunk) result.push(chunk.trim());
          chunk = sentence;
        } else {
          chunk = chunk ? chunk + " " + sentence : sentence;
        }
      }
      if (chunk) result.push(chunk.trim());
      return result.join("\n\n");
    }
    return temp;
  });

  cleaned = processedParagraphs.join("\n\n");

  // 10. Strip mid-sentence refusal if the whole response is a refusal
  const isFullRefusal = /^(i`?m sorry|i cannot|i can'?t|i am not able|unfortunately)/i.test(cleaned);
  if (isFullRefusal && cleaned.length < 300) {
    return "";
  }

  return cleaned.trim();
}

/** Token-level post-processing for streaming (lightweight) */
export function postProcessToken(token: string): string {
  return token;
}
