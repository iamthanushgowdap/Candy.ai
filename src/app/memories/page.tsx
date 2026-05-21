"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Brain,
  Search,
  Trash2,
  ArrowLeft,
  Filter,
  AlertTriangle,
  Sparkles,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Memory {
  id: string;
  memory_text: string;
  layer: string;
  importance: number;
  created_at: string;
}

type LayerKey = "all" | "long_term" | "short_term" | "episodic" | "behavioral";

interface LayerConfig {
  key: LayerKey;
  label: string;
  color: string;
  bgActive: string;
  dot: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LAYERS: LayerConfig[] = [
  {
    key: "all",
    label: "All",
    color: "text-zinc-300",
    bgActive: "bg-zinc-700/40 border-zinc-600",
    dot: "bg-zinc-400",
  },
  {
    key: "long_term",
    label: "Long Term",
    color: "text-indigo-400",
    bgActive: "bg-indigo-500/15 border-indigo-500/40",
    dot: "bg-indigo-400",
  },
  {
    key: "short_term",
    label: "Short Term",
    color: "text-cyan-400",
    bgActive: "bg-cyan-500/15 border-cyan-500/40",
    dot: "bg-cyan-400",
  },
  {
    key: "episodic",
    label: "Episodic",
    color: "text-violet-400",
    bgActive: "bg-violet-500/15 border-violet-500/40",
    dot: "bg-violet-400",
  },
  {
    key: "behavioral",
    label: "Behavioral",
    color: "text-amber-400",
    bgActive: "bg-amber-500/15 border-amber-500/40",
    dot: "bg-amber-400",
  },
];

const LAYER_BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  long_term: { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20" },
  short_term: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  episodic: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  behavioral: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
};

const LAYER_BAR_COLORS: Record<string, string> = {
  long_term: "bg-indigo-500",
  short_term: "bg-cyan-500",
  episodic: "bg-violet-500",
  behavioral: "bg-amber-500",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatLayerLabel(layer: string): string {
  return layer
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeLayer, setActiveLayer] = useState<LayerKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Debounce search input ───────────────────────────────────────────────
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // ── Fetch memories ──────────────────────────────────────────────────────
  const fetchMemories = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeLayer !== "all") params.set("layer", activeLayer);
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());

      const qs = params.toString();
      const res = await fetch(`/api/memories${qs ? `?${qs}` : ""}`);
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch (err) {
      console.error("Failed to fetch memories:", err);
      setMemories([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeLayer, debouncedQuery]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // ── Delete memory ───────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/memories?id=${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setMemories((prev) => prev.filter((m) => m.id !== deleteTarget.id));
        showToast("Memory fragment purged from matrix.");
      } else {
        showToast("Failed to delete memory.");
      }
    } catch (err) {
      console.error("Delete failed:", err);
      showToast("Error deleting memory.");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // ── Stats ───────────────────────────────────────────────────────────────
  const totalCount = memories.length;
  const layerCounts: Record<string, number> = {};
  for (const m of memories) {
    layerCounts[m.layer] = (layerCounts[m.layer] || 0) + 1;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden">
      {/* ── Ambient background glow ────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[500px] h-[500px] rounded-full bg-violet-500/[0.03] blur-[100px]" />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-cyan-500/[0.02] blur-[80px]" />
      </div>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* ── Navigation ─────────────────────────────────────────────── */}
        <div
          className="mb-6"
          style={{ animation: "fade-in-up 0.35s cubic-bezier(0.16,1,0.3,1) forwards" }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-200 transition-colors duration-200 group text-sm"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200" />
            <span>Back to Console</span>
          </Link>
        </div>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div
          className="mb-8"
          style={{ animation: "fade-in-up 0.45s cubic-bezier(0.16,1,0.3,1) forwards" }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">
                Memory Matrix
              </h1>
              <p className="text-zinc-500 text-sm mt-0.5">
                Semantic pgvector memory database — inspect, search, and manage AI recall layers
              </p>
            </div>
          </div>
        </div>

        {/* ── Stats bar ──────────────────────────────────────────────── */}
        <div
          className="mb-6 bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-4"
          style={{ animation: "fade-in-up 0.55s cubic-bezier(0.16,1,0.3,1) forwards" }}
        >
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-sm text-zinc-400">Total Memories</span>
              <span className="text-sm font-semibold text-zinc-100 tabular-nums">
                {isLoading ? "—" : totalCount}
              </span>
            </div>
            <div className="hidden sm:block w-px h-5 bg-zinc-800" />
            {LAYERS.filter((l) => l.key !== "all").map((layer) => (
              <div key={layer.key} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${layer.dot}`} />
                <span className="text-xs text-zinc-500">{layer.label}</span>
                <span className="text-xs font-medium text-zinc-300 tabular-nums">
                  {isLoading ? "—" : layerCounts[layer.key] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Search + Filters ───────────────────────────────────────── */}
        <div
          className="mb-6 space-y-4"
          style={{ animation: "fade-in-up 0.6s cubic-bezier(0.16,1,0.3,1) forwards" }}
        >
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search memories by keyword or semantic concept..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-xl
                         pl-11 pr-10 py-3 text-sm text-zinc-100 placeholder:text-zinc-600
                         focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20
                         transition-all duration-200`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Layer tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-zinc-600 mr-1" />
            {LAYERS.map((layer) => {
              const isActive = activeLayer === layer.key;
              return (
                <button
                  key={layer.key}
                  onClick={() => setActiveLayer(layer.key)}
                  className={`
                    px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200
                    ${
                      isActive
                        ? `${layer.bgActive} ${layer.color}`
                        : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    }
                  `}
                >
                  {layer.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Memory grid ────────────────────────────────────────────── */}
        {isLoading ? (
          /* Loading skeleton */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5 space-y-3"
                style={{
                  animation: `pulse-soft 2s ease-in-out infinite`,
                  animationDelay: `${i * 0.12}s`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="h-5 w-20 bg-zinc-800/60 rounded-md" />
                  <div className="h-4 w-4 bg-zinc-800/40 rounded" />
                </div>
                <div className="space-y-2">
                  <div className="h-3.5 w-full bg-zinc-800/50 rounded" />
                  <div className="h-3.5 w-4/5 bg-zinc-800/40 rounded" />
                  <div className="h-3.5 w-3/5 bg-zinc-800/30 rounded" />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="h-3 w-16 bg-zinc-800/30 rounded" />
                  <div className="h-1.5 w-12 bg-zinc-800/30 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : memories.length === 0 ? (
          /* Empty state */
          <div
            className="flex flex-col items-center justify-center py-24 text-center"
            style={{ animation: "fade-in-up 0.5s cubic-bezier(0.16,1,0.3,1) forwards" }}
          >
            <div className="w-16 h-16 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center mb-5">
              <Brain className="w-8 h-8 text-zinc-600" />
            </div>
            <h3 className="text-lg font-medium text-zinc-400 mb-2">No memories found</h3>
            <p className="text-sm text-zinc-600 max-w-sm">
              {debouncedQuery || activeLayer !== "all"
                ? "Try adjusting your search query or layer filter to find matching memories."
                : "The memory matrix is empty. Memories will appear here as the AI learns from conversations."}
            </p>
          </div>
        ) : (
          /* Memory cards grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {memories.map((memory, idx) => {
              const badge = LAYER_BADGE_STYLES[memory.layer] ?? {
                bg: "bg-zinc-500/10",
                text: "text-zinc-400",
                border: "border-zinc-500/20",
              };
              const barColor = LAYER_BAR_COLORS[memory.layer] ?? "bg-zinc-500";
              const importance = Math.min(Math.max(memory.importance ?? 0, 0), 1);

              return (
                <div
                  key={memory.id}
                  className={`group bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5
                             hover:border-zinc-700/60 hover:bg-zinc-900/40
                             transition-all duration-300 ease-out`}
                  style={{
                    opacity: 0,
                    animation: `fade-in-up 0.4s cubic-bezier(0.16,1,0.3,1) ${idx * 0.05}s forwards`,
                  }}
                >
                  {/* Top row: badge + delete */}
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium
                                  border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {formatLayerLabel(memory.layer)}
                    </span>
                    <button
                      onClick={() => setDeleteTarget(memory)}
                      className={`p-1.5 rounded-lg text-zinc-600 opacity-0 group-hover:opacity-100
                                 hover:text-rose-400 hover:bg-rose-500/10
                                 transition-all duration-200`}
                      aria-label="Delete memory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Memory text (3-line clamp) */}
                  <p className="text-sm text-zinc-300 leading-relaxed mb-4 line-clamp-3">
                    {memory.memory_text}
                  </p>

                  {/* Bottom row: date + importance bar */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-600">{formatDate(memory.created_at)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-600 tabular-nums">
                        {Math.round(importance * 100)}%
                      </span>
                      <div className="w-14 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-500`}
                          style={{ width: `${importance * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
           DELETE CONFIRMATION MODAL
         ═══════════════════════════════════════════════════════════════════════ */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ animation: "fade-in 0.15s ease-out forwards" }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !isDeleting && setDeleteTarget(null)}
          />

          {/* Modal card */}
          <div
            className={`relative bg-zinc-950/80 backdrop-blur-2xl border border-zinc-800 rounded-2xl
                       shadow-2xl shadow-black/40 max-w-md w-full p-6`}
            style={{
              animation: "fade-in-up 0.25s cubic-bezier(0.16,1,0.3,1) forwards",
            }}
          >
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-100 mb-1">Delete Memory Fragment?</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  This will permanently remove this memory from the pgvector matrix. This action cannot be undone.
                </p>
              </div>
            </div>

            {/* Preview of memory being deleted */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 mb-5">
              <p className="text-xs text-zinc-400 line-clamp-2">{deleteTarget.memory_text}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className={`px-4 py-2 rounded-xl text-sm font-medium text-zinc-400
                           border border-zinc-800 hover:bg-zinc-800/50 hover:text-zinc-200
                           transition-all duration-200 disabled:opacity-50`}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className={`px-4 py-2 rounded-xl text-sm font-medium text-rose-100
                           bg-rose-500/20 border border-rose-500/30
                           hover:bg-rose-500/30 hover:border-rose-500/50
                           transition-all duration-200 disabled:opacity-50
                           flex items-center gap-2`}
              >
                {isDeleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-rose-300/40 border-t-rose-300 rounded-full animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirm Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
           TOAST NOTIFICATION
         ═══════════════════════════════════════════════════════════════════════ */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 toast-enter">
          <div
            className={`bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-xl
                       px-5 py-3 shadow-2xl shadow-black/40
                       flex items-center gap-3 max-w-sm`}
          >
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-sm text-zinc-200">{toast}</span>
            <button
              onClick={() => setToast(null)}
              className="text-zinc-600 hover:text-zinc-300 transition-colors ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
