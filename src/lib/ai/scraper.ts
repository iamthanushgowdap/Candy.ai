import * as cheerio from "cheerio";

/**
 * High-fidelity web content extractor using Cheerio
 * Navigates to a URL, evaluates page content, strips style/script/nav clutter, 
 * and falls back to a clean raw regex crawler on errors.
 */
export async function scrapePage(url: string): Promise<string> {
  try {
    console.log(`[Scraper] Fetching web content for: ${url}`);
    
    const res = await fetch(url, { 
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" 
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Eliminate noise (scripts, styles, headers, footers, navigation) to isolate high-value content
    const noiseSelectors = ["script", "style", "nav", "header", "footer", "iframe", "noscript", "svg"];
    noiseSelectors.forEach(sel => {
      $(sel).remove();
    });
    
    const title = $("title").text().trim() || url;
    const bodyText = $("body").text().trim() || $.text().trim();

    const cleanText = bodyText
      .replace(/\s+/g, " ") // Collapse nested whitespace and newlines
      .slice(0, 1500);      // Restrict character count for prompt window optimization

    return `[Web Scraper Content from: ${url}]\nTitle: ${title}\nContent:\n${cleanText}`;
  } catch (e: any) {
    console.warn(`[Scraper] Cheerio extraction failed: ${e.message}. Launching raw fallback crawler.`);
    
    try {
      const res = await fetch(url, { 
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" 
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      
      const html = await res.text();
      
      // High-performance regex pipeline to clean raw HTML
      const cleanText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200);

      return `[Fallback Web Content from: ${url}]\nContent:\n${cleanText}`;
    } catch (fetchErr: any) {
      return `Error: Unable to extract content from "${url}". Details: ${fetchErr.message}`;
    }
  }
}
