/**
 * Code Generation Fallback Template Engine
 * 
 * When qwen2.5:0.5b refuses or produces <40 token garbage for generation tasks,
 * this engine detects the intent and returns a high-quality structured template.
 * 
 * Covers: landing pages, HTML/CSS, React components, APIs, functions, scripts.
 */

/**
 * Detects the generation intent from the user message and returns
 * a high-quality template string, or null if not a known code-gen request.
 */
export function generateCodeFallback(msg: string): string | null {
  // ── Landing Pages ──────────────────────────────────────────────────
  if (matchesAny(msg, ["landing page", "landing-page", "homepage", "home page"])) {
    const topic = extractTopic(msg, ["landing page", "landing-page", "homepage", "home page", "for", "a", "an", "the"]);
    return buildLandingPage(topic);
  }

  // ── React Component ────────────────────────────────────────────────
  if (matchesAny(msg, ["react component", "react card", "react button", "react modal", "react form"])) {
    const name = extractTopic(msg, ["react", "component", "card", "button", "modal", "form", "for", "a", "an"]);
    return buildReactComponent(name || "MyComponent");
  }

  // ── HTML Page ──────────────────────────────────────────────────────
  if (matchesAny(msg, ["html page", "html file", "html template", "simple webpage", "simple web page"])) {
    const topic = extractTopic(msg, ["html", "page", "file", "template", "simple", "webpage", "for", "a", "an"]);
    return buildHtmlTemplate(topic);
  }

  // ── REST API / Express ─────────────────────────────────────────────
  if (matchesAny(msg, ["rest api", "express api", "express server", "node api", "api server"])) {
    return buildExpressApi();
  }

  // ── JavaScript / TypeScript function ──────────────────────────────
  if (matchesAny(msg, ["javascript function", "typescript function", "js function", "ts function", "write a function", "create a function"])) {
    const topic = extractTopic(msg, ["javascript", "typescript", "js", "ts", "function", "write", "create", "a", "for", "that"]);
    return buildJsFunction(topic);
  }

  // ── Python function / script ───────────────────────────────────────
  if (matchesAny(msg, ["python function", "python script", "write python", "create python"])) {
    const topic = extractTopic(msg, ["python", "function", "script", "write", "create", "a", "for", "that"]);
    return buildPythonFunction(topic);
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesAny(msg: string, keywords: string[]): boolean {
  return keywords.some(k => msg.includes(k));
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/** Extract meaningful topic words from the message, excluding noise words */
function extractTopic(msg: string, stopWords: string[]): string {
  const words = msg.toLowerCase().split(/\s+/);
  const filtered = words.filter(w => !stopWords.includes(w) && w.length > 2);
  return toTitleCase(filtered.join(" ").trim()) || "My App";
}

// ─── Templates ────────────────────────────────────────────────────────────────

function buildLandingPage(topic: string): string {
  const safeTitle = topic || "My Business";
  return `Here is a clean, responsive landing page for **${safeTitle}**:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #0a0a0a; color: #f1f1f1; }

    /* Nav */
    nav { display: flex; justify-content: space-between; align-items: center;
          padding: 1.2rem 5%; background: #111; border-bottom: 1px solid #222; }
    .logo { font-size: 1.4rem; font-weight: 700; color: #fff; }
    nav ul { list-style: none; display: flex; gap: 2rem; }
    nav ul a { color: #aaa; text-decoration: none; font-size: 0.9rem; }
    nav ul a:hover { color: #fff; }
    .nav-cta { background: #e63946; color: #fff !important; padding: 0.5rem 1.2rem;
               border-radius: 6px; font-weight: 600; }

    /* Hero */
    .hero { text-align: center; padding: 7rem 5% 5rem; }
    .hero h1 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 800; line-height: 1.2;
               margin-bottom: 1.2rem; }
    .hero h1 span { color: #e63946; }
    .hero p { color: #999; font-size: 1.1rem; max-width: 580px; margin: 0 auto 2.5rem; }
    .hero-btns { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
    .btn-primary { background: #e63946; color: #fff; padding: 0.85rem 2rem;
                   border: none; border-radius: 8px; font-size: 1rem; font-weight: 600;
                   cursor: pointer; text-decoration: none; transition: opacity 0.2s; }
    .btn-primary:hover { opacity: 0.85; }
    .btn-outline { background: transparent; color: #fff; padding: 0.85rem 2rem;
                   border: 1px solid #444; border-radius: 8px; font-size: 1rem;
                   cursor: pointer; text-decoration: none; transition: border-color 0.2s; }
    .btn-outline:hover { border-color: #fff; }

    /* Features */
    .features { padding: 5rem 5%; background: #111; }
    .features h2 { text-align: center; font-size: 2rem; margin-bottom: 3rem; }
    .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 2rem; }
    .feature-card { background: #1a1a1a; border: 1px solid #222; border-radius: 12px;
                    padding: 2rem; transition: border-color 0.2s; }
    .feature-card:hover { border-color: #e63946; }
    .feature-card .icon { font-size: 2rem; margin-bottom: 1rem; }
    .feature-card h3 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    .feature-card p { color: #888; font-size: 0.9rem; line-height: 1.6; }

    /* CTA Section */
    .cta-section { text-align: center; padding: 6rem 5%; }
    .cta-section h2 { font-size: 2rem; margin-bottom: 1rem; }
    .cta-section p { color: #888; margin-bottom: 2rem; }

    /* Footer */
    footer { text-align: center; padding: 2rem; background: #111;
             border-top: 1px solid #1e1e1e; color: #555; font-size: 0.85rem; }
  </style>
</head>
<body>

  <nav>
    <div class="logo">${safeTitle}</div>
    <ul>
      <li><a href="#features">Features</a></li>
      <li><a href="#about">About</a></li>
      <li><a href="#contact">Contact</a></li>
      <li><a href="#" class="nav-cta">Get Started</a></li>
    </ul>
  </nav>

  <section class="hero">
    <h1>Power Your <span>${safeTitle}</span><br>Experience</h1>
    <p>Everything you need, in one place. Fast, reliable, and built for the modern world.</p>
    <div class="hero-btns">
      <a href="#" class="btn-primary">Start Free Trial</a>
      <a href="#features" class="btn-outline">Learn More</a>
    </div>
  </section>

  <section class="features" id="features">
    <h2>Why Choose Us</h2>
    <div class="feature-grid">
      <div class="feature-card">
        <div class="icon">⚡</div>
        <h3>Lightning Fast</h3>
        <p>Optimized for speed from the ground up. Zero compromise on performance.</p>
      </div>
      <div class="feature-card">
        <div class="icon">🔒</div>
        <h3>Secure by Default</h3>
        <p>Enterprise-grade security built in. Your data is always protected.</p>
      </div>
      <div class="feature-card">
        <div class="icon">🎯</div>
        <h3>Easy to Use</h3>
        <p>Intuitive design that gets out of your way and lets you focus on results.</p>
      </div>
      <div class="feature-card">
        <div class="icon">📈</div>
        <h3>Scales With You</h3>
        <p>From solo to enterprise — grows as your needs grow.</p>
      </div>
    </div>
  </section>

  <section class="cta-section" id="contact">
    <h2>Ready to get started?</h2>
    <p>Join thousands of users already using ${safeTitle}.</p>
    <a href="#" class="btn-primary">Get Started Free →</a>
  </section>

  <footer>
    &copy; ${new Date().getFullYear()} ${safeTitle}. All rights reserved.
  </footer>

</body>
</html>
\`\`\`

**What's included:**
- Responsive dark-theme design
- Navigation bar with CTA button
- Hero section with headline + action buttons
- 4-column feature grid
- Call-to-action section
- Footer

Customize the colors, text, and icons to match your brand.`;
}

function buildReactComponent(name: string): string {
  const safe = name.replace(/\s+/g, "") || "MyComponent";
  return `Here is a React component for **${name}**:

\`\`\`tsx
import React from "react";

interface ${safe}Props {
  title?: string;
  description?: string;
  onClick?: () => void;
}

export default function ${safe}({ title = "${name}", description = "Description here", onClick }: ${safe}Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-600 transition-colors">
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-zinc-400 text-sm mb-4">{description}</p>
      {onClick && (
        <button
          onClick={onClick}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors"
        >
          Action
        </button>
      )}
    </div>
  );
}
\`\`\``;
}

function buildHtmlTemplate(topic: string): string {
  return `Here is a simple HTML template for **${topic}**:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${topic}</title>
  <style>
    body { font-family: sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; }
    h1 { color: #111; } p { color: #555; line-height: 1.7; }
  </style>
</head>
<body>
  <h1>${topic}</h1>
  <p>Your content goes here.</p>
</body>
</html>
\`\`\``;
}

function buildExpressApi(): string {
  return `Here is a basic Express.js REST API server:

\`\`\`javascript
import express from "express";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// GET all items
app.get("/api/items", (req, res) => {
  res.json({ items: [], total: 0 });
});

// POST create item
app.post("/api/items", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  res.status(201).json({ id: Date.now(), name, createdAt: new Date() });
});

app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
\`\`\``;
}

function buildJsFunction(topic: string): string {
  return `Here is a JavaScript/TypeScript function for **${topic}**:

\`\`\`typescript
/**
 * ${topic}
 */
export function ${toCamelCase(topic)}(input: string): string {
  if (!input?.trim()) return "";

  // TODO: implement your logic here
  const result = input.trim();

  return result;
}

// Example usage:
// const output = ${toCamelCase(topic)}("hello world");
// console.log(output);
\`\`\``;
}

function buildPythonFunction(topic: string): string {
  return `Here is a Python function for **${topic}**:

\`\`\`python
def ${toSnakeCase(topic)}(input_str: str) -> str:
    """
    ${topic}
    
    Args:
        input_str: Input string to process
    Returns:
        Processed result string
    """
    if not input_str or not input_str.strip():
        return ""
    
    # TODO: implement your logic here
    result = input_str.strip()
    
    return result


# Example usage:
if __name__ == "__main__":
    output = ${toSnakeCase(topic)}("hello world")
    print(output)
\`\`\``;
}

function toCamelCase(str: string): string {
  return str.toLowerCase().replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ").map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join("") || "myFunction";
}

function toSnakeCase(str: string): string {
  return str.toLowerCase().replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_") || "my_function";
}
