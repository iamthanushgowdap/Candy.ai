/**
 * Document Chunker Utility
 * Splitting large documents (PDFs, Notes, Text) into semantic chunks with overlap for pgvector indexing.
 */

export interface TextChunk {
  text: string;
  index: number;
}

/**
 * Split a raw text into overlapping chunks of a given size.
 * Uses a character-count sliding window, but attempts to split on clean boundaries like double newlines, newlines, or spaces.
 */
export function chunkText(
  text: string,
  chunkSize: number = 500,
  overlap: number = 100
): TextChunk[] {
  if (!text || text.trim().length === 0) return [];
  if (text.length <= chunkSize) {
    return [{ text: text.trim(), index: 0 }];
  }

  const chunks: TextChunk[] = [];
  let index = 0;
  let cursor = 0;

  while (cursor < text.length) {
    let end = Math.min(cursor + chunkSize, text.length);

    // If we're not at the very end, try to find a clean boundary nearby to split on
    if (end < text.length) {
      const boundaryRange = 80; // Search range for clean boundaries
      let foundBoundary = false;

      // Try looking for paragraph boundary (\n\n)
      const paragraphIdx = text.lastIndexOf("\n\n", end);
      if (paragraphIdx > end - boundaryRange && paragraphIdx > cursor) {
        end = paragraphIdx + 2;
        foundBoundary = true;
      }

      // Try looking for newline boundary (\n)
      if (!foundBoundary) {
        const newlineIdx = text.lastIndexOf("\n", end);
        if (newlineIdx > end - boundaryRange && newlineIdx > cursor) {
          end = newlineIdx + 1;
          foundBoundary = true;
        }
      }

      // Try looking for sentence boundary (. ) or (? ) or (! )
      if (!foundBoundary) {
        const periodIdx = text.lastIndexOf(". ", end);
        if (periodIdx > end - boundaryRange && periodIdx > cursor) {
          end = periodIdx + 2;
          foundBoundary = true;
        }
      }

      // Fallback: split on space
      if (!foundBoundary) {
        const spaceIdx = text.lastIndexOf(" ", end);
        if (spaceIdx > end - boundaryRange && spaceIdx > cursor) {
          end = spaceIdx + 1;
        }
      }
    }

    const chunkContent = text.substring(cursor, end).trim();
    if (chunkContent.length > 5) {
      chunks.push({
        text: chunkContent,
        index
      });
      index++;
    }

    // Move sliding window cursor, subtracting the overlap
    cursor = end - overlap;
    if (cursor >= text.length - overlap) {
      break;
    }
  }

  return chunks;
}
