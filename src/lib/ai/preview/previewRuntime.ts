import { VirtualProject, getStylesBundle } from "./virtualFs";

/**
 * Generates the complete, self-contained HTML srcDoc string for the sandboxed iframe.
 * Runs React 18, Tailwind Play, Lucide icons, and @babel/standalone entirely client-side.
 */
export function generatePreviewSrcDoc(project: VirtualProject): string {
  // Convert virtual files to a secure JSON payload to embed inside the sandbox
  const filesPayload = JSON.stringify(project.files);
  const entryPoint = project.entryPoint;
  const projectType = project.type;
  const cssStyles = getStylesBundle(project);

  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antgravity Preview Sandbox</title>
  
  <!-- Tailwind CSS Play CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            zinc: {
              150: '#ececed',
              850: '#202024',
              950: '#09090b',
            }
          }
        }
      }
    }
  </script>

  <!-- React & React DOM from UNPKG -->
  <script src="https://unpkg.com/react@18.2.0/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18.2.0/umd/react-dom.development.js" crossorigin></script>

  <!-- Lucide Icons Core CDN -->
  <script src="https://unpkg.com/lucide@0.344.0/dist/umd/lucide.min.js"></script>

  <!-- Babel Standalone Compiler -->
  <script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js"></script>

  <!-- Embedded Project Stylesheets -->
  <style>
    /* Premium dark-mode custom scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(63, 63, 70, 0.4);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(63, 63, 70, 0.6);
    }
    ${cssStyles}
  </style>
</head>
<body class="h-full bg-zinc-950 text-zinc-100 antialiased overflow-x-hidden">
  
  <!-- Mounting Point -->
  <div id="root" class="min-h-full">
    <div id="loading" class="flex flex-col items-center justify-center min-h-[300px] h-full gap-3 text-zinc-400">
      <svg class="animate-spin h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="text-xs font-semibold tracking-wider uppercase text-zinc-500 animate-pulse">
        Transpiling Workspace Components...
      </span>
    </div>
  </div>

  <script>
    // Universal Error Catcher
    window.onerror = function(message, source, lineno, colno, error) {
      window.parent.postMessage({
        type: 'SANDBOX_ERROR',
        error: {
          message: message,
          source: source,
          line: lineno,
          column: colno,
          stack: error ? error.stack : ''
        }
      }, '*');
      return true;
    };

    window.addEventListener('unhandledrejection', function(event) {
      window.parent.postMessage({
        type: 'SANDBOX_ERROR',
        error: {
          message: event.reason ? event.reason.message || String(event.reason) : 'Unhandled promise rejection',
          stack: event.reason ? event.reason.stack || '' : ''
        }
      }, '*');
    });

    try {
      // 1. Load the Virtual Filesystem payload
      const vfs = ${filesPayload};
      const entryPoint = "${entryPoint}";
      const projectType = "${projectType}";

      // 2. Setup standard React imports & Lucide React mock in the sandbox VFS
      const modules = {};

      // Implement Virtual CommonJS Mock Registry
      function require(moduleName) {
        const clean = moduleName.replace(/^\\.\\//, '').replace(/\\.(tsx|jsx|ts|js)$/, '');
        
        // Match in Virtual Filesystem
        const matchingKey = Object.keys(vfs).find(k => k.replace(/\\.(tsx|jsx|ts|js)$/, '') === clean);
        if (matchingKey && modules[matchingKey]) {
          return modules[matchingKey].exports;
        }

        // Standard library mappings
        if (moduleName === 'react') {
          return window.React;
        }
        if (moduleName === 'react-dom') {
          return window.ReactDOM;
        }
        if (moduleName === 'lucide-react') {
          return window.LucideReact;
        }

        throw new Error("Module '" + moduleName + "' could not be resolved inside VFS sandbox runtime.");
      }

      // 3. Initialize dynamic Lucide React wrapper proxy
      window.LucideReact = new Proxy({}, {
        get(target, iconName) {
          return function DynamicIcon(props) {
            const kebabName = iconName
              .replace(/([A-Z])/g, "-$1")
              .toLowerCase()
              .replace(/^\\-/, "");
            
            const iconData = window.lucide && (
              window.lucide.icons[kebabName] || 
              window.lucide.icons[iconName.toLowerCase()]
            );
            
            if (!iconData) {
              // Simple vector fallback dot
              return React.createElement("svg", {
                width: props.size || 24,
                height: props.size || 24,
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 2,
                ...props
              }, React.createElement("circle", { cx: 12, cy: 12, r: 4 }));
            }

            const children = iconData[1].map(([tagName, attrs], idx) => 
              React.createElement(tagName, { key: idx, ...attrs })
            );

            const defaultAttrs = iconData[0];
            return React.createElement(
              "svg",
              {
                xmlns: "http://www.w3.org/2000/svg",
                ...defaultAttrs,
                ...props,
                width: props.size || defaultAttrs.width || 24,
                height: props.size || defaultAttrs.height || 24,
                className: "lucide lucide-" + kebabName + " " + (props.className || "")
              },
              ...children
            );
          };
        }
      });

      // 4. Compile and execute files in dependency-safe order
      function compileAndExecute() {
        if (projectType === 'vanilla') {
          // For vanilla projects, render index.html
          const htmlFile = vfs[entryPoint] || Object.values(vfs).find(f => f.filename.endsWith('.html'));
          if (htmlFile) {
            document.open();
            document.write(htmlFile.content);
            document.close();
            
            // Re-bind error catchers in case document.write wiped them
            window.onerror = function(message, source, lineno, colno, error) {
              window.parent.postMessage({
                type: 'SANDBOX_ERROR',
                error: { message, source, line: lineno, column: colno, stack: error ? error.stack : '' }
              }, '*');
              return true;
            };
          }
          return;
        }

        // Compile React workspace
        // First, compile files and store their module wrappers
        Object.keys(vfs).forEach(filename => {
          const file = vfs[filename];
          if (file.language === 'css') return; // Handled in header style block

          try {
            // Transpile JSX/TSX in the browser
            const transpiled = Babel.transform(file.content, {
              presets: ['react', 'typescript'],
              plugins: [
                ['transform-modules-commonjs', { strictMode: false }]
              ]
            }).code;

            // Define module space
            modules[filename] = {
              exports: {}
            };

            // Execute in module sandbox with simulated require context
            const moduleFn = new Function('require', 'exports', 'module', transpiled);
            moduleFn(require, modules[filename].exports, modules[filename]);

          } catch (compilationError) {
            // Post dynamic compile failures
            window.parent.postMessage({
              type: 'SANDBOX_COMPILE_ERROR',
              error: {
                filename: filename,
                message: compilationError.message,
                stack: compilationError.stack
              }
            }, '*');
            throw compilationError;
          }
        });

        // 5. Mount entry-point component
        const entryModule = modules[entryPoint];
        if (!entryModule) {
          throw new Error("Unable to locate React entry-point: '" + entryPoint + "'");
        }

        // Resolve component: exports.default or exports itself
        const AppRoot = entryModule.exports.default || entryModule.exports.App || Object.values(entryModule.exports)[0];
        
        if (!AppRoot) {
          throw new Error("React component entry-point '" + entryPoint + "' did not export any valid component. Make sure to export default function App() { ... }");
        }

        // Clean loading element and render React Tree
        const rootContainer = document.getElementById('root');
        rootContainer.innerHTML = '';
        
        const root = ReactDOM.createRoot(rootContainer);
        root.render(React.createElement(AppRoot));

        // Signal success to parent
        window.parent.postMessage({ type: 'SANDBOX_RENDER_SUCCESS' }, '*');
      }

      // Execute compile loop on load
      compileAndExecute();

    } catch (bootstrapError) {
      console.error("Sandbox Bootstrap Fail:", bootstrapError);
      window.parent.postMessage({
        type: 'SANDBOX_ERROR',
        error: {
          message: bootstrapError.message,
          stack: bootstrapError.stack
        }
      }, '*');
    }
  </script>
</body>
</html>`;
}
