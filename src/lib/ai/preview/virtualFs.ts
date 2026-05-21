import { ExtractedFile } from "./codeDetector";

export interface VirtualFile {
  filename: string;
  content: string;
  language: string;
  updatedAt: number;
}

export interface VirtualProject {
  type: "react" | "vanilla";
  files: Record<string, VirtualFile>;
  entryPoint: string;
}

/**
 * Creates a cohesive virtual project structure from raw extracted code files.
 */
export function buildVirtualProject(
  files: ExtractedFile[],
  existingProject?: VirtualProject | null
): VirtualProject {
  const projectFiles: Record<string, VirtualFile> = existingProject 
    ? { ...existingProject.files } 
    : {};

  // Track timestamps and merge files
  const now = Date.now();
  files.forEach((file) => {
    projectFiles[file.filename] = {
      filename: file.filename,
      content: file.content,
      language: file.language,
      updatedAt: now
    };
  });

  // Determine project type based on contents
  let type: "react" | "vanilla" = "vanilla";
  let hasReact = false;

  Object.values(projectFiles).forEach((f) => {
    if (
      ["jsx", "tsx"].includes(f.language) ||
      f.content.includes("React") ||
      f.content.includes("import ") && (f.content.includes("react") || f.content.includes("react-dom"))
    ) {
      hasReact = true;
    }
  });

  if (hasReact) {
    type = "react";
  }

  // Determine entry point
  let entryPoint = "index.html";
  if (type === "react") {
    // Standard react entry points
    if (projectFiles["App.tsx"]) {
      entryPoint = "App.tsx";
    } else if (projectFiles["index.tsx"]) {
      entryPoint = "index.tsx";
    } else if (projectFiles["App.jsx"]) {
      entryPoint = "App.jsx";
    } else {
      // Find the first tsx or jsx file
      const found = Object.keys(projectFiles).find(
        (fn) => fn.endsWith(".tsx") || fn.endsWith(".jsx")
      );
      entryPoint = found || Object.keys(projectFiles)[0] || "App.tsx";
    }
  } else {
    // Vanilla html entry
    if (projectFiles["index.html"]) {
      entryPoint = "index.html";
    } else {
      const found = Object.keys(projectFiles).find((fn) => fn.endsWith(".html"));
      entryPoint = found || Object.keys(projectFiles)[0] || "index.html";
    }
  }

  // Inject defaults if empty to avoid broken rendering
  if (Object.keys(projectFiles).length === 0) {
    if (type === "react") {
      projectFiles["App.tsx"] = {
        filename: "App.tsx",
        content: `import React from 'react';\n\nexport default function App() {\n  return (\n    <div className="p-8 text-center bg-zinc-900 text-white rounded-xl">\n      <h1 className="text-2xl font-bold">Hello World</h1>\n    </div>\n  );\n}`,
        language: "tsx",
        updatedAt: now
      };
      entryPoint = "App.tsx";
    } else {
      projectFiles["index.html"] = {
        filename: "index.html",
        content: `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>Sandbox</title>\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body class="bg-zinc-950 text-white p-8">\n  <h1 className="text-2xl font-bold text-center">Hello World</h1>\n</body>\n</html>`,
        language: "html",
        updatedAt: now
      };
      entryPoint = "index.html";
    }
  }

  return {
    type,
    files: projectFiles,
    entryPoint
  };
}

/**
 * Returns a bundle containing aggregated styles or custom script wrappers if needed.
 */
export function getStylesBundle(project: VirtualProject): string {
  let cssBundle = "";
  Object.values(project.files).forEach((f) => {
    if (f.language === "css" || f.filename.endsWith(".css")) {
      cssBundle += `\n/* File: ${f.filename} */\n${f.content}\n`;
    }
  });
  return cssBundle;
}
