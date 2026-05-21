import React, { useState } from "react";
import { Copy, Check, ChevronDown, ExternalLink, Globe, Play } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

function parseSearchSources(text: string): SearchSource[] {
  const sources: SearchSource[] = [];
  const lines = text.split("\n");
  let currentSource: Partial<SearchSource> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Match bullet items with markdown links: - **[title](url)** or - [title](url)
    const linkMatch = line.match(/^[-*]\s+(?:\*\*)?\[(.*?)\]\((.*?)\)(?:\*\*)?/);
    if (linkMatch) {
      if (currentSource && currentSource.title && currentSource.url) {
        sources.push(currentSource as SearchSource);
      }
      currentSource = {
        title: linkMatch[1],
        url: linkMatch[2],
        snippet: ""
      };
      continue;
    }
    
    // Accumulate description snippet text for the current source
    if (currentSource) {
      const cleanLine = line.replace(/^[*_\s]+|[*_\s]+$/g, "");
      if (cleanLine) {
        currentSource.snippet = currentSource.snippet 
          ? currentSource.snippet + " " + cleanLine 
          : cleanLine;
      }
    }
  }
  
  if (currentSource && currentSource.title && currentSource.url) {
    sources.push(currentSource as SearchSource);
  }
  
  return sources;
}

const SearchSourcesAccordion: React.FC<{ sources: SearchSource[] }> = ({ sources }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="mt-4 border border-zinc-900 bg-zinc-950/40 rounded-2xl overflow-hidden transition-all duration-300 shadow-md select-none">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left bg-zinc-900/40 hover:bg-zinc-900/80 transition-all font-sans cursor-pointer outline-none"
      >
        <div className="flex items-center gap-2.5">
          <Globe className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-zinc-300">Live Verified Search Sources</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 font-bold font-mono">
            {sources.length} {sources.length === 1 ? 'source' : 'sources'}
          </span>
        </div>
        <div className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <ChevronDown className={`w-4 h-4 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      
      {isOpen && (
        <div className="px-4 pb-4 pt-2 border-t border-zinc-900 bg-zinc-950/20 divide-y divide-zinc-900/60 transition-all duration-300 animate-fade-in">
          {sources.map((src, idx) => {
            let hostname = "";
            try {
              hostname = new URL(src.url).hostname.replace("www.", "");
            } catch (e) {
              hostname = src.url;
            }

            return (
              <div key={idx} className="py-3 first:pt-1 last:pb-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1 select-text">
                  <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-850 text-indigo-400">
                    {hostname}
                  </span>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-zinc-200 hover:text-indigo-450 hover:underline transition-colors flex items-center gap-1.5 leading-snug break-words"
                  >
                    <span>{src.title}</span>
                    <ExternalLink className="w-3 h-3 text-zinc-500 inline shrink-0" />
                  </a>
                </div>
                {src.snippet && (
                  <p className="text-[11px] leading-relaxed text-zinc-500 italic font-medium pl-2.5 border-l border-zinc-800 mt-1 select-text">
                    &quot;{src.snippet}&quot;
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content) return null;

  // Split out the search sources section if present
  let mainContent = content;
  let searchSourcesSection = "";

  const searchSourcesHeaderIndex = content.indexOf("🔍 Live Verified Search Sources");
  if (searchSourcesHeaderIndex !== -1) {
    const precedingPart = content.slice(0, searchSourcesHeaderIndex);
    const headingMatch = precedingPart.match(/(?:---\s*\n*)?(?:###\s*)?$/);
    
    if (headingMatch) {
      mainContent = precedingPart.slice(0, precedingPart.length - headingMatch[0].length).trim();
    } else {
      mainContent = precedingPart.trim();
    }
    
    searchSourcesSection = content.slice(searchSourcesHeaderIndex);
  }

  const parsedSources = searchSourcesSection ? parseSearchSources(searchSourcesSection) : [];

  // Split mainContent into blocks: code blocks vs text blocks
  const parts = mainContent.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 font-sans text-zinc-200">
      {parts.map((part, partIdx) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          // Code block
          const lines = part.slice(3, -3).trim().split("\n");
          let language = "text";
          let codeLines = lines;

          if (lines.length > 0 && lines[0].trim().match(/^[a-zA-Z0-9+#-]+$/)) {
            language = lines[0].trim();
            codeLines = lines.slice(1);
          }

          const codeText = codeLines.join("\n");

          return <CodeBlock key={partIdx} code={codeText} language={language} />;
        } else {
          // Regular text
          const lines = part.split("\n");
          return lines.map((line, lineIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={lineIdx} className="h-2" />;

            // Headings
            if (trimmed.startsWith("# ")) {
              return (
                <h1 key={lineIdx} className="text-lg font-bold text-white mt-4 mb-2 tracking-tight">
                  {renderInlineMarkdown(trimmed.slice(2))}
                </h1>
              );
            }
            if (trimmed.startsWith("## ")) {
              return (
                <h2 key={lineIdx} className="text-base font-semibold text-zinc-100 mt-3.5 mb-1.5 tracking-tight border-b border-zinc-800/80 pb-1">
                  {renderInlineMarkdown(trimmed.slice(3))}
                </h2>
              );
            }
            if (trimmed.startsWith("### ")) {
              return (
                <h3 key={lineIdx} className="text-sm font-semibold text-indigo-400 mt-3 mb-1">
                  {renderInlineMarkdown(trimmed.slice(4))}
                </h3>
              );
            }

            // Bullet lists
            if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
              const listContent = trimmed.replace(/^[-*]\s+/, "");
              return (
                <ul key={lineIdx} className="list-disc pl-5 my-1 text-zinc-300">
                  <li className="text-[13px] leading-relaxed">
                    {renderInlineMarkdown(listContent)}
                  </li>
                </ul>
              );
            }

            // Ordered lists
            if (/^\d+\.\s+/.test(trimmed)) {
              const listContent = trimmed.replace(/^\d+\.\s+/, "");
              const number = trimmed.match(/^(\d+)\./)?.[1] || "1";
              return (
                <ol key={lineIdx} className="list-decimal pl-5 my-1 text-zinc-300">
                  <li value={parseInt(number)} className="text-[13px] leading-relaxed">
                    {renderInlineMarkdown(listContent)}
                  </li>
                </ol>
              );
            }

            // Default paragraph
            return (
              <p key={lineIdx} className="text-[13px] sm:text-sm leading-relaxed text-zinc-350 my-1.5">
                {renderInlineMarkdown(line)}
              </p>
            );
          });
        }
      })}

      {parsedSources.length > 0 && (
        <SearchSourcesAccordion sources={parsedSources} />
      )}
    </div>
  );
};

interface CodeBlockProps {
  code: string;
  language: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPreviewable = ["html", "css", "js", "ts", "javascript", "typescript", "jsx", "tsx", "react"].includes(language.toLowerCase()) || code.includes("html") || code.includes("import React");

  const handleOpenSandbox = () => {
    window.dispatchEvent(new CustomEvent("trigger-open-sandbox"));
  };

  return (
    <div className="premium-card overflow-hidden my-3 border border-zinc-800 rounded-xl bg-zinc-950 shadow-lg fade-in">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/60 border-b border-zinc-800 text-[11px] text-zinc-400 font-mono select-none">
        <span>{language.toLowerCase()}</span>
        <div className="flex items-center gap-3.5">
          {isPreviewable && (
            <button
              onClick={handleOpenSandbox}
              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-305 transition-colors cursor-pointer outline-none font-semibold"
              title="Open sandbox preview panel"
            >
              <Play className="w-3 h-3 fill-indigo-400" />
              <span>Run Preview</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer outline-none"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="p-4 overflow-x-auto font-mono text-[12px] sm:text-[13px] text-zinc-100 bg-zinc-950/40 leading-relaxed scrollbar-thin select-text">
        <code>{code}</code>
      </pre>
    </div>
  );
};

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const parts = text.split(regex);

  parts.forEach((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      tokens.push(
        <strong key={index} className="font-bold text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    } else if (part.startsWith("*") && part.endsWith("*")) {
      tokens.push(
        <em key={index} className="italic text-zinc-350">
          {part.slice(1, -1)}
        </em>
      );
    } else if (part.startsWith("`") && part.endsWith("`")) {
      tokens.push(
        <code
          key={index}
          className="bg-zinc-800/80 border border-zinc-700/60 px-1.5 py-0.5 rounded text-xs font-mono text-indigo-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    } else {
      tokens.push(part);
    }
  });

  return tokens;
}
