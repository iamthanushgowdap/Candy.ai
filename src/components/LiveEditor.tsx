import React, { useRef, useEffect } from "react";

interface LiveEditorProps {
  value: string;
  onChange: (val: string) => void;
  language: string;
  filename: string;
}

export const LiveEditor: React.FC<LiveEditorProps> = ({
  value,
  onChange,
  language,
  filename
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Split lines to generate the sidebar counts
  const lines = value.split("\n");
  const lineCount = Math.max(lines.length, 1);

  // Synchronize scroll of line numbers column and textarea
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  useEffect(() => {
    handleScroll();
  }, [value]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 border border-zinc-900 rounded-xl overflow-hidden shadow-2xl">
      {/* Editor Header Status Tab */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-900 select-none">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-tight text-zinc-300">
            {filename}
          </span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-950/60 px-2 py-0.5 rounded border border-zinc-850">
          {language}
        </span>
      </div>

      {/* Editor Body */}
      <div className="flex-1 flex relative overflow-hidden font-mono text-sm leading-relaxed">
        {/* Line Numbers Sidebar */}
        <div
          ref={lineNumbersRef}
          className="w-12 bg-zinc-950 border-r border-zinc-900 text-right pr-3 py-4 select-none text-zinc-600 font-mono text-xs overflow-hidden scrollbar-none"
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i} className="h-[21px] leading-[21px]">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text Input Area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          className="flex-1 h-full px-4 py-4 bg-zinc-950 text-zinc-200 outline-none resize-none font-mono text-xs sm:text-sm leading-[21px] border-0 focus:ring-0 overflow-y-auto selection:bg-indigo-500/20 selection:text-indigo-200"
          placeholder="// Write or edit your component code here..."
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
        />
      </div>
    </div>
  );
};
