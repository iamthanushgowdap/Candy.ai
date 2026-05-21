import { chromium } from "playwright";

/**
 * High-fidelity web content extractor using Playwright
 * Navigates to a URL, evaluates page content, strips style/script/nav clutter, 
 * and falls back to a clean raw fetch crawler on sandbox/system errors.
 */
export async function scrapePage(url: string): Promise<string> {
  let browser;
  try {
    console.log(`[Scraper] Launching Playwright browser for: ${url}`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.setExtraHTTPHeaders({
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    
    // Navigate with a strict 10s timeout to keep the agentic loop fast
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    
    const title = await page.title();
    const bodyText = await page.evaluate(() => {
      // Eliminate noise (scripts, styles, headers, footers, navigation) to isolate high-value content
      const noiseSelectors = ["script", "style", "nav", "header", "footer", "iframe", "noscript"];
      noiseSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      });
      return document.body.innerText.trim();
    });

    const cleanText = bodyText
      .replace(/\s+/g, " ") // Collapse nested whitespace and newlines
      .slice(0, 1500);      // Restrict character count for prompt window optimization

    return `[Web Scraper Content from: ${url}]\nTitle: ${title}\nContent:\n${cleanText}`;
  } catch (e: any) {
    console.warn(`[Scraper] Playwright browser extraction failed: ${e.message}. Launching raw fetch crawler.`);
    
    try {
      const res = await fetch(url, { 
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" 
        } 
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
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        // Suppress browser close warnings
      }
    }
  }
}
