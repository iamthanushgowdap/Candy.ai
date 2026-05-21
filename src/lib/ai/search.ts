/**
 * AI Web Search Module — Antgravity v2
 *
 * Scrapes DuckDuckGo HTML with pre-filtering, domain deduplication,
 * and snippet quality validation.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function cleanHtmlString(str: string): string {
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDomain(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace("www.", "");
  } catch {
    return "";
  }
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const seenDomains = new Set<string>();

  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      signal: AbortSignal.timeout(6000) // Lowered timeout for low latency
    });

    if (res.ok) {
      const html = await res.text();

      // Regex matches DDG HTML results layout
      const regex = /<h2\s+class="result__title">[\s\S]*?<a[^>]+class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

      let match;
      while ((match = regex.exec(html)) !== null && results.length < 5) {
        const rawUrl = match[1];
        const rawTitle = match[2];
        const rawSnippet = match[3];

        let decodedUrl = rawUrl;
        if (rawUrl.includes("uddg=")) {
          const parts = rawUrl.split("uddg=");
          if (parts[1]) {
            decodedUrl = decodeURIComponent(parts[1].split("&")[0]);
          }
        }

        if (decodedUrl.startsWith("//")) {
          decodedUrl = "https:" + decodedUrl;
        }

        const title = cleanHtmlString(rawTitle);
        const snippet = cleanHtmlString(rawSnippet);

        // Quality checks
        if (snippet.length < 15) continue;
        if (title.length < 3) continue;

        // Domain deduplication
        const domain = extractDomain(decodedUrl);
        if (domain) {
          if (seenDomains.has(domain)) continue;
          seenDomains.add(domain);
        }

        results.push({
          title,
          url: decodedUrl,
          snippet
        });
      }
    }
  } catch (e: any) {
    console.warn(`[Search] DuckDuckGo HTML scraping failed: ${e.message}`);
  }

  // Fallback to landing link if no results
  if (results.length === 0) {
    results.push({
      title: `DuckDuckGo Search for "${query}"`,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      snippet: `Find live updates and search results for "${query}" directly on DuckDuckGo.`
    });
  }

  return results;
}
