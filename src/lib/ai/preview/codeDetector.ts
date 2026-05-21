export interface ExtractedFile {
  filename: string;
  content: string;
  language: string;
}

export interface DetectionResult {
  hasCode: boolean;
  files: ExtractedFile[];
}

/**
 * Robustly parses markdown to detect and extract code blocks, supporting both
 * completed blocks and active streams (unclosed blocks at the end of text).
 */
export function detectExecutableCode(markdown: string): DetectionResult {
  if (!markdown) {
    return { hasCode: false, files: [] };
  }

  const files: ExtractedFile[] = [];
  
  // 1. Regular expression to find all code blocks (even unclosed ones at the end)
  // We can look for ``` followed by language name, and then anything up to the next ``` OR the end of string.
  const codeBlockRegex = /```([a-zA-Z0-9+#-]+)?\n([\s\S]*?)(?:```|$)/g;
  
  let match;
  let fileIndex = 0;
  
  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const language = (match[1] || "text").trim().toLowerCase();
    const content = match[2];
    
    // We only care about executable frontend assets
    const isExecutable = [
      "html", "css", "jsx", "tsx", "javascript", "typescript", "js", "ts"
    ].includes(language);
    
    if (!isExecutable) {
      continue;
    }

    // Try to extract a custom filename from the code content
    // Check first 3 lines for pattern like: // filename.ext or /* filename.ext */ or <!-- filename.ext -->
    let filename = "";
    const lines = content.split("\n");
    const searchLines = lines.slice(0, 3);
    
    for (const line of searchLines) {
      const trimmed = line.trim();
      const filePattern = /(?:(?:\/\/|\/\*|<!--|#)\s*([a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)\s*(?:\*\/|-->)?)/;
      const fileMatch = trimmed.match(filePattern);
      if (fileMatch && fileMatch[1]) {
        filename = fileMatch[1].trim();
        break;
      }
    }

    // Fallback default filenames based on language
    if (!filename) {
      fileIndex++;
      if (language === "html") {
        filename = fileIndex === 1 ? "index.html" : `page${fileIndex}.html`;
      } else if (language === "css") {
        filename = "styles.css";
      } else if (["jsx", "tsx"].includes(language)) {
        filename = fileIndex === 1 ? "App.tsx" : `Component${fileIndex}.tsx`;
      } else {
        filename = fileIndex === 1 ? "index.js" : `script${fileIndex}.js`;
      }
    }

    files.push({
      filename,
      content,
      language
    });
  }

  return {
    hasCode: files.length > 0,
    files
  };
}
