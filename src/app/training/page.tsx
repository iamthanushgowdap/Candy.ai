"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Zap,
  ArrowLeft,
  Lock,
  Unlock,
  Cpu,
  Play,
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TrainingJob {
  id: string;
  versionName: string;
  status: "pending" | "running" | "completed" | "failed";
  smokeTest: boolean;
  forceTrain: boolean;
  retries: number;
  maxRetries: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

interface TrainingStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
}

interface TrainingData {
  isLocked: boolean;
  stats: TrainingStats;
  jobs: TrainingJob[];
}

interface HardwareInfo {
  totalVramGb: number;
  usedVramGb: number;
  availableVramGb: number;
  gpuName: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function vramColor(pct: number): string {
  if (pct < 0.5) return "#34d399"; // emerald-400
  if (pct < 0.75) return "#fbbf24"; // amber-400
  return "#fb7185"; // rose-400
}

function statusBadgeClasses(status: TrainingJob["status"]): string {
  switch (status) {
    case "pending":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "running":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30 animate-pulse";
    case "completed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "failed":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    default:
      return "bg-zinc-800 text-zinc-400 border-zinc-700";
  }
}

function StatusIcon({ status }: { status: TrainingJob["status"] }) {
  const size = 14;
  switch (status) {
    case "pending":
      return <Clock size={size} className="text-amber-400" />;
    case "running":
      return <Loader2 size={size} className="text-cyan-400 animate-spin" />;
    case "completed":
      return <CheckCircle size={size} className="text-emerald-400" />;
    case "failed":
      return <XCircle size={size} className="text-rose-400" />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  VRAM Bar Component                                                 */
/* ------------------------------------------------------------------ */

function VramBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const barWidth = 200;
  const filledWidth = pct * barWidth;
  const color = vramColor(pct);

  return (
    <div className="flex items-center gap-3">
      <svg
        width={barWidth + 4}
        height={20}
        viewBox={`0 0 ${barWidth + 4} 20`}
        className="rounded-full overflow-hidden"
      >
        {/* background track */}
        <rect
          x={2}
          y={2}
          width={barWidth}
          height={16}
          rx={8}
          fill="#27272a"
          stroke="#3f3f46"
          strokeWidth={1}
        />
        {/* gradient definition */}
        <defs>
          <linearGradient id="vram-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
        </defs>
        {/* filled bar */}
        {filledWidth > 0 && (
          <rect
            x={2}
            y={2}
            width={filledWidth}
            height={16}
            rx={8}
            fill="url(#vram-grad)"
            className="transition-all duration-700 ease-out"
          />
        )}
        {/* glow overlay */}
        {filledWidth > 0 && (
          <rect
            x={2}
            y={2}
            width={filledWidth}
            height={8}
            rx={8}
            fill="white"
            opacity={0.08}
          />
        )}
      </svg>
      <span className="text-sm font-medium tabular-nums" style={{ color }}>
        {used.toFixed(1)} / {total.toFixed(1)} GB
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function TrainingPage() {
  const [trainingData, setTrainingData] = useState<TrainingData | null>(null);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [loadingAction, setLoadingAction] = useState<
    "smoke" | "full" | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- Toast helper ---- */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  /* ---- Data fetching ---- */
  const fetchTraining = useCallback(async () => {
    try {
      const res = await fetch("/api/training");
      if (res.ok) {
        const data: TrainingData = await res.json();
        setTrainingData(data);
      }
    } catch {
      /* silent retry on next interval */
    }
  }, []);

  const fetchHardware = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/system-health");
      if (res.ok) {
        const data = await res.json();
        if (data.hardware) setHardware(data.hardware);
      }
    } catch {
      /* silent */
    }
  }, []);

  /* ---- Initial load + polling ---- */
  useEffect(() => {
    setMounted(true);
    fetchTraining();
    fetchHardware();

    const interval = setInterval(() => {
      fetchTraining();
      fetchHardware();
    }, 10_000);

    return () => clearInterval(interval);
  }, [fetchTraining, fetchHardware]);

  /* ---- Trigger training ---- */
  const triggerTraining = async (smokeTest: boolean) => {
    const actionKey = smokeTest ? "smoke" : "full";
    setLoadingAction(actionKey);
    try {
      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trigger",
          smokeTest,
          forceTrain: !smokeTest,
        }),
      });
      if (!res.ok) {
        let errorMsg = "Failed to trigger training.";
        try {
          const errorData = await res.json();
          errorMsg = errorData.message || errorData.error || errorMsg;
        } catch {
          try {
            const rawText = await res.text();
            errorMsg = rawText || errorMsg;
          } catch {}
        }
        showToast(errorMsg);
        return;
      }
      const data = await res.json();
      if (data.success) {
        showToast(data.message || "Training triggered successfully.");
      } else {
        showToast(data.message || "Failed to trigger training.");
      }
      await fetchTraining();
    } catch {
      showToast("Network error — could not reach training API.");
    } finally {
      setLoadingAction(null);
    }
  };

  /* ---- Derived data ---- */
  const stats = trainingData?.stats ?? {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    total: 0,
  };
  const isLocked = trainingData?.isLocked ?? false;
  const jobs = trainingData?.jobs ?? [];

  /* ---- Stat card config ---- */
  const statCards: {
    label: string;
    value: number;
    icon: React.ReactNode;
    color: string;
    bg: string;
    border: string;
  }[] = [
    {
      label: "Pending",
      value: stats.pending,
      icon: <Clock size={20} className="text-amber-400" />,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      label: "Running",
      value: stats.running,
      icon: <Loader2 size={20} className="text-cyan-400 animate-spin" />,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
    },
    {
      label: "Completed",
      value: stats.completed,
      icon: <CheckCircle size={20} className="text-emerald-400" />,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      label: "Failed",
      value: stats.failed,
      icon: <XCircle size={20} className="text-rose-400" />,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    },
  ];

  /* ---- Entrance animation wrapper ---- */
  const animDelay = (i: number) =>
    ({
      opacity: mounted ? 1 : 0,
      transform: mounted ? "translateY(0)" : "translateY(16px)",
      transition: `opacity 0.5s ease ${i * 0.07}s, transform 0.5s ease ${i * 0.07}s`,
    }) as React.CSSProperties;

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden">
      {/* ---- Ambient background glow ---- */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-violet-500/[0.04] blur-[120px]" />
      </div>

      {/* ---- Toast ---- */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl
            bg-zinc-900/90 backdrop-blur-xl border border-zinc-700/60
            text-sm text-zinc-200 shadow-xl shadow-black/30
            animate-[slideDown_0.35s_ease-out]`}
          style={{
            animationName: "slideDown",
          }}
        >
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-indigo-400" />
            {toast}
          </div>
        </div>
      )}

      {/* ---- Main container ---- */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6 min-h-screen">
        {/* ---- Nav + Title ---- */}
        <header style={animDelay(0)}>
          <Link
            href="/"
            className={`inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300
              transition-colors duration-200 mb-4 group`}
          >
            <ArrowLeft
              size={16}
              className="group-hover:-translate-x-1 transition-transform duration-200"
            />
            Back to Chat
          </Link>
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/25
                shadow-lg shadow-indigo-500/10`}
            >
              <Zap size={22} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                Auto Training Pipeline
              </h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                Monitor &amp; control autonomous fine-tuning jobs
              </p>
            </div>
          </div>
        </header>

        {/* ---- Status Banner ---- */}
        <div
          style={animDelay(1)}
          className={`bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5
            flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6`}
        >
          {/* Lock status */}
          <div className="flex items-center gap-2.5">
            {isLocked ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
                <Lock size={15} className="text-rose-400" />
                <span className="text-sm font-medium text-rose-400">
                  Locked
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <Unlock size={15} className="text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">
                  Unlocked
                </span>
              </div>
            )}
          </div>

          {/* GPU name */}
          {hardware && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Cpu size={15} className="text-violet-400" />
              <span className="font-medium text-zinc-300">
                {hardware.gpuName}
              </span>
            </div>
          )}

          {/* VRAM bar */}
          {hardware && (
            <div className="sm:ml-auto">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  VRAM
                </span>
              </div>
              <VramBar used={hardware.usedVramGb} total={hardware.totalVramGb} />
            </div>
          )}
        </div>

        {/* ---- Stats Row ---- */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          style={animDelay(2)}
        >
          {statCards.map((card, i) => (
            <div
              key={card.label}
              className={`bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-4
                hover:border-zinc-700/60 transition-all duration-300 group cursor-default`}
              style={animDelay(2 + i * 0.5)}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  {card.label}
                </span>
                <div
                  className={`p-1.5 rounded-lg ${card.bg} ${card.border} border
                    group-hover:scale-110 transition-transform duration-200`}
                >
                  {card.icon}
                </div>
              </div>
              <div className={`text-3xl font-bold tabular-nums ${card.color}`}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* ---- Action Buttons ---- */}
        <div
          className="flex flex-col sm:flex-row gap-3"
          style={animDelay(4)}
        >
          <button
            onClick={() => triggerTraining(true)}
            disabled={loadingAction !== null || isLocked}
            className={`flex-1 flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl
              bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 font-semibold text-sm
              hover:bg-cyan-500/20 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10
              active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200`}
          >
            {loadingAction === "smoke" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Play size={18} />
            )}
            Trigger Smoke Test
          </button>

          <button
            onClick={() => triggerTraining(false)}
            disabled={loadingAction !== null || isLocked}
            className={`flex-1 flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl
              bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 font-semibold text-sm
              hover:bg-indigo-500/20 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10
              active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200`}
          >
            {loadingAction === "full" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Zap size={18} />
            )}
            Force Full Training
          </button>

          <button
            onClick={() => {
              fetchTraining();
              fetchHardware();
              showToast("Refreshed training data.");
            }}
            className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl
              bg-zinc-900/60 border border-zinc-800 text-zinc-400 text-sm font-medium
              hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/60
              active:scale-[0.98] transition-all duration-200`}
          >
            <RefreshCw size={16} />
            <span className="sm:inline hidden">Refresh</span>
          </button>
        </div>

        {/* ---- Job History ---- */}
        <section style={animDelay(5)} className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Job History
            </h2>
            <span className="text-xs text-zinc-600 tabular-nums">
              {jobs.length} job{jobs.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div
            className={`bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl
              overflow-hidden flex-1`}
          >
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                <RotateCcw size={32} className="mb-3 opacity-40" />
                <p className="text-sm">No training jobs yet</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[420px] divide-y divide-zinc-900/80">
                {jobs.map((job, idx) => (
                  <div
                    key={job.id}
                    className="px-5 py-4 hover:bg-zinc-800/20 transition-colors duration-150 group"
                    style={animDelay(5 + idx * 0.3)}
                  >
                    {/* Row top: name + badge */}
                    <div className="flex items-center gap-3 mb-2">
                      <StatusIcon status={job.status} />
                      <span className="font-medium text-sm text-zinc-200 truncate flex-1">
                        {job.versionName}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs
                          font-semibold border ${statusBadgeClasses(job.status)}`}
                      >
                        {job.status}
                      </span>
                      {job.smokeTest && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider
                            bg-cyan-500/10 text-cyan-500 border border-cyan-500/20`}
                        >
                          smoke
                        </span>
                      )}
                      {job.forceTrain && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider
                            bg-indigo-500/10 text-indigo-400 border border-indigo-500/20`}
                        >
                          forced
                        </span>
                      )}
                    </div>

                    {/* Row bottom: metadata */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        Created {formatTimestamp(job.createdAt)}
                      </span>
                      {job.startedAt && (
                        <span className="flex items-center gap-1">
                          <Play size={11} />
                          Started {formatTimestamp(job.startedAt)}
                        </span>
                      )}
                      {job.completedAt && (
                        <span className="flex items-center gap-1">
                          <CheckCircle size={11} />
                          Done {formatTimestamp(job.completedAt)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <RotateCcw size={11} />
                        {job.retries}/{job.maxRetries} retries
                      </span>
                    </div>

                    {/* Error message */}
                    {job.error && (
                      <div
                        className={`mt-2 px-3 py-2 rounded-xl bg-rose-500/5 border border-rose-500/15
                          text-xs text-rose-400/90 font-mono leading-relaxed break-all`}
                      >
                        {job.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---- Footer ---- */}
        <footer
          className="text-center text-xs text-zinc-700 py-4"
          style={animDelay(6)}
        >
          Auto-refreshing every 10 s&nbsp;·&nbsp;Candy.ai Training Console
        </footer>
      </div>

      {/* ---- Keyframe styles ---- */}
      <style jsx>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translate(-50%, -12px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </div>
  );
}
