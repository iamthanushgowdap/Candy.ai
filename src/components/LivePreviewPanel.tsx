import React, { useState, useEffect, useRef } from "react";
import {
  Monitor,
  Tablet,
  Smartphone,
  Maximize2,
  Minimize2,
  Download,
  Copy,
  Check,
  RotateCcw,
  Code2,
  Eye,
  AlertTriangle,
  FileCode,
  Wrench,
  ChevronRight
} from "lucide-react";
import { VirtualProject, VirtualFile } from "../lib/ai/preview/virtualFs";
import { generatePreviewSrcDoc } from "../lib/ai/preview/previewRuntime";
import { LiveEditor } from "./LiveEditor";

interface LivePreviewPanelProps {
  project: VirtualProject | null;
  onUpdateFile: (filename: string, content: string) => void;
  onAutoRepair: (
    filename: string,
    content: string,
    errorMsg: string,
    stack: string
  ) => void;
  isRepairing: boolean;
}

export const LivePreviewPanel: React.FC<LivePreviewPanelProps> = ({
  project,
  onUpdateFile,
  onAutoRepair,
  isRepairing
}) => {
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedFilename, setSelectedFilename] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Error States caught from the iframe sandbox
  const [sandboxError, setSandboxError] = useState<{
    message: string;
    filename?: string;
    stack?: string;
  } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync selected file when project changes or loaded
  useEffect(() => {
    if (project) {
      if (!selectedFilename || !project.files[selectedFilename]) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedFilename(project.entryPoint);
      }
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFilename("");
    }
  }, [project, selectedFilename]);

  // Set up receiver for iframe sandboxed logs & error reporting
  useEffect(() => {
    const handleSandboxMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "SANDBOX_ERROR") {
        setSandboxError({
          message: data.error.message || "An unknown runtime execution error occurred.",
          stack: data.error.stack || ""
        });
      } else if (data.type === "SANDBOX_COMPILE_ERROR") {
        setSandboxError({
          filename: data.error.filename || "App.tsx",
          message: data.error.message || "Compilation failed.",
          stack: data.error.stack || ""
        });
      } else if (data.type === "SANDBOX_RENDER_SUCCESS") {
        setSandboxError(null);
      }
    };

    window.addEventListener("message", handleSandboxMessage);
    return () => window.removeEventListener("message", handleSandboxMessage);
  }, []);

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-950 text-zinc-500 border-l border-zinc-900">
        <FileCode className="w-8 h-8 text-zinc-700 mb-3 animate-pulse" />
        <span className="text-xs font-mono select-none">No active live preview session.</span>
      </div>
    );
  }

  const selectedFile = project.files[selectedFilename];

  // Refresh compiler view
  const handleReload = () => {
    setSandboxError(null);
    setIframeKey((prev) => prev + 1);
  };

  const handleDownload = () => {
    if (!selectedFile) return;
    try {
      const blob = new Blob([selectedFile.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = selectedFile.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyCode = () => {
    if (!selectedFile) return;
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Compile full iframe HTML with bundled CDN assets
  const srcDoc = generatePreviewSrcDoc(project);

  // Viewport framing sizes matching high-end design systems
  const getViewportClass = () => {
    if (viewport === "mobile") {
      return "w-[375px] h-[80%] rounded-[32px] border-[12px] border-zinc-900 shadow-2xl overflow-hidden transition-all duration-300";
    }
    if (viewport === "tablet") {
      return "w-[768px] h-[90%] rounded-2xl border-[8px] border-zinc-900 shadow-xl overflow-hidden transition-all duration-300";
    }
    return "w-full h-full border-0 transition-all duration-300";
  };

  return (
    <div
      className={`flex flex-col bg-zinc-950 border-l border-zinc-900 h-full overflow-hidden transition-all duration-300 ${
        isFullscreen ? "fixed inset-0 z-[1000] border-0" : "flex-1"
      }`}
    >
      {/* Workspace Panel Header Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3.5 bg-zinc-900/40 border-b border-zinc-900 shrink-0 gap-3">
        {/* Toggle tabs for Preview vs Source Code */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-900 self-start">
          <button
            onClick={() => setActiveTab("preview")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "preview"
                ? "bg-zinc-900 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Interactive Preview</span>
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "code"
                ? "bg-zinc-900 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Workspace Code</span>
          </button>
        </div>

        {/* Viewport & Utility Action Matrix */}
        <div className="flex items-center justify-between sm:justify-end gap-3.5">
          {/* Viewport Controls (only visible in Preview Mode) */}
          {activeTab === "preview" && !sandboxError && (
            <div className="flex items-center gap-0.5 bg-zinc-950 p-1 rounded-lg border border-zinc-900 select-none">
              <button
                onClick={() => setViewport("desktop")}
                className={`p-1.5 rounded transition-all cursor-pointer ${
                  viewport === "desktop" ? "text-indigo-400 bg-zinc-900" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="Desktop View"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewport("tablet")}
                className={`p-1.5 rounded transition-all cursor-pointer ${
                  viewport === "tablet" ? "text-indigo-400 bg-zinc-900" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="Tablet View"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewport("mobile")}
                className={`p-1.5 rounded transition-all cursor-pointer ${
                  viewport === "mobile" ? "text-indigo-400 bg-zinc-900" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="Mobile View"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleReload}
              className="p-2 rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer"
              title="Force Hot-Reload"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {activeTab === "code" && (
              <>
                <button
                  onClick={handleCopyCode}
                  className="p-2 rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer"
                  title="Copy File Content"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleDownload}
                  className="p-2 rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer"
                  title="Download File"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Workspace"}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Frame Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left-Side File List (only visible in Code Workspace mode, or collapsed on narrow layouts) */}
        {activeTab === "code" && (
          <div className="w-48 border-r border-zinc-900 bg-zinc-950 p-3 flex flex-col gap-2 shrink-0 overflow-y-auto">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1 select-none">
              Workspace Files
            </span>
            {Object.keys(project.files).map((filename) => (
              <button
                key={filename}
                onClick={() => setSelectedFilename(filename)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono text-left transition-all truncate cursor-pointer ${
                  selectedFilename === filename
                    ? "bg-zinc-900 text-indigo-400 border border-zinc-800"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <FileCode className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{filename}</span>
                </div>
                {selectedFilename === filename && (
                  <ChevronRight className="w-3 h-3 text-indigo-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content Pane */}
        <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">
          
          {activeTab === "preview" ? (
            /* PREVIEW INTERACTION MODE */
            <div className="flex-1 flex items-center justify-center p-4 bg-zinc-900/20 overflow-hidden">
              
              {sandboxError ? (
                /* PREVIEW RUNTIME ERROR GRACEFUL OVERLAY */
                <div className="w-full max-w-xl p-6 rounded-2xl bg-zinc-900 border border-red-950/40 bg-red-950/5 text-zinc-200 shadow-2xl flex flex-col gap-4 animate-fade-in-up">
                  <div className="flex items-center gap-3 text-rose-400 border-b border-red-950/30 pb-3">
                    <AlertTriangle className="w-5 h-5 animate-bounce" />
                    <h3 className="font-bold text-sm sm:text-base">
                      Sandbox Execution Exception
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {sandboxError.filename && (
                      <div className="text-xs font-mono text-zinc-400">
                        <span className="font-bold text-zinc-300">File:</span> {sandboxError.filename}
                      </div>
                    )}
                    <div className="text-xs sm:text-sm font-mono text-rose-200 bg-red-950/20 border border-red-950/40 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48 scrollbar-thin">
                      {sandboxError.message}
                    </div>
                    {sandboxError.stack && (
                      <details className="cursor-pointer">
                        <summary className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider select-none hover:text-zinc-300">
                          View Stack Trace
                        </summary>
                        <pre className="mt-2 text-[10px] sm:text-xs font-mono text-zinc-400 bg-zinc-950 p-3 rounded-lg overflow-x-auto whitespace-pre leading-relaxed max-h-36 scrollbar-thin">
                          {sandboxError.stack}
                        </pre>
                      </details>
                    )}
                  </div>

                  {/* Auto Repair Command Row */}
                  <div className="flex items-center justify-end gap-2 border-t border-zinc-900/60 pt-3.5 mt-1.5">
                    <button
                      onClick={handleReload}
                      className="px-3.5 py-2 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Re-compile</span>
                    </button>
                    <button
                      onClick={() =>
                        onAutoRepair(
                          sandboxError.filename || selectedFilename || "App.tsx",
                          selectedFile?.content || "",
                          sandboxError.message,
                          sandboxError.stack || ""
                        )
                      }
                      disabled={isRepairing}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-650/10"
                    >
                      <Wrench className={`w-3.5 h-3.5 ${isRepairing ? "animate-spin" : ""}`} />
                      <span>{isRepairing ? "Auto-Repairing Component..." : "AI Auto-Repair"}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* LIVE PREVIEW IFRAME VIEWPORT */
                <div className={`${getViewportClass()} bg-zinc-950 relative`}>
                  <iframe
                    key={iframeKey}
                    ref={iframeRef}
                    srcDoc={srcDoc}
                    sandbox="allow-scripts allow-same-origin"
                    className="w-full h-full border-0 bg-transparent"
                  />
                </div>
              )}

            </div>
          ) : (
            /* SOURCE CODE INTERACTIVE EDITOR MODE */
            <div className="flex-1 p-4 overflow-hidden">
              {selectedFile ? (
                <LiveEditor
                  value={selectedFile.content}
                  onChange={(newVal) => onUpdateFile(selectedFile.filename, newVal)}
                  language={selectedFile.language}
                  filename={selectedFile.filename}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center p-8 text-zinc-600 text-xs font-mono">
                  Select a workspace file to inspect or edit.
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
