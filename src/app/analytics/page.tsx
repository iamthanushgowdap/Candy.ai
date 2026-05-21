"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Clock,
  Cpu,
  Database,
  BarChart3,
  TrendingUp,
  Percent,
  RefreshCw,
  Zap,
} from "lucide-react";

interface AnalyticsData {
  totalRequests: number;
  successRate: number;
  avgTotalLatencyMs: number;
  avgFirstTokenLatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  cacheHits: Record<string, number>;
  modelUsage: Record<string, number>;
  latencyTimeline: { ts: string; ms: number }[];
  tokenTimeline: { ts: string; tokens: number }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    try {
      const res = await fetch("/api/analytics");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (isRefresh) showToast("Telemetry dashboard synchronized.");
      }
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    setMounted(true);
    fetchAnalytics();

    const interval = setInterval(() => {
      fetchAnalytics();
    }, 12000); // refresh telemetry every 12 seconds

    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  // SVG Chart rendering helper
  const renderSVGLineChart = (
    points: { x: number; y: number }[],
    width = 500,
    height = 150,
    color = "#818cf8"
  ) => {
    if (points.length < 2) {
      return (
        <svg width="100%" height={height} className="overflow-visible">
          <text x="50%" y="50%" fill="#71717a" textAnchor="middle" fontSize="12">
            Awaiting telemetry logs...
          </text>
        </svg>
      );
    }

    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    // Map points to SVG viewbox (0,0) -> (width, height)
    // Add 10px padding to top and bottom
    const pad = 10;
    const mapped = points.map((p, idx) => {
      const xCoord = ((idx) / (points.length - 1)) * width;
      const yCoord = height - pad - ((p.y - minY) / rangeY) * (height - 2 * pad);
      return { x: xCoord, y: yCoord, raw: p };
    });

    const pathData = mapped
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    const areaData = `
      ${pathData} 
      L ${mapped[mapped.length - 1].x} ${height} 
      L ${mapped[0].x} ${height} 
      Z
    `;

    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#18181b" strokeWidth={1} strokeDasharray="4 4" />
        <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="#27272a" strokeWidth={1} />

        {/* Fill Area */}
        <path d={areaData} fill={`url(#grad-${color})`} />

        {/* Main Line */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-500 ease-out"
        />

        {/* Data points (dots) */}
        {mapped.slice(-15).map((p, idx) => (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="#09090b"
            stroke={color}
            strokeWidth={1.5}
            className="hover:r-5 cursor-pointer transition-all"
          />
        ))}
      </svg>
    );
  };

  // Ring gauge rendering helper
  const renderRingGauge = (percentage: number, size = 120, strokeWidth = 10, color = "#818cf8") => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;

    return (
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#18181b"
            strokeWidth={strokeWidth}
          />
          {/* Active colored ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-xl font-bold tracking-tight text-zinc-100 tabular-nums">
            {percentage.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  };

  if (!mounted) return null;

  // Animation delay styles helper
  const animDelay = (i: number) => ({
    opacity: 1,
    transform: "translateY(0)",
    transition: `opacity 0.4s ease ${i * 0.05}s, transform 0.4s ease ${i * 0.05}s`,
  }) as React.CSSProperties;

  // Cache stats compute
  const cacheStats = data?.cacheHits ?? { L1: 0, L2: 0, L3: 0, none: 0 };
  const totalHits = (cacheStats.L1 || 0) + (cacheStats.L2 || 0) + (cacheStats.L3 || 0);
  const totalCacheRequests = totalHits + (cacheStats.none || 0);
  const cacheHitRatio = totalCacheRequests > 0 ? (totalHits / totalCacheRequests) * 100 : 0;

  // Map latency logs for line chart
  const latencyPoints = (data?.latencyTimeline || []).map((e, idx) => ({
    x: idx,
    y: e.ms,
  }));

  // Map token logs for line chart
  const tokenPoints = (data?.tokenTimeline || []).map((e, idx) => ({
    x: idx,
    y: e.tokens,
  }));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-20%] left-[-15%] w-[500px] h-[500px] rounded-full bg-cyan-500/[0.03] blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[600px] h-[600px] rounded-full bg-indigo-500/[0.04] blur-[100px]" />
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 text-sm text-zinc-200 shadow-2xl shadow-black/40 flex items-center gap-2">
          <Activity size={14} className="text-cyan-400" />
          {toast}
        </div>
      )}

      {/* Main Container */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6 min-h-screen">
        
        {/* Back navigation */}
        <div style={animDelay(0)}>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors duration-200 group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform duration-200" />
            Back to Console
          </Link>
        </div>

        {/* Header */}
        <header style={animDelay(1)} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/25 shadow-lg shadow-cyan-500/10">
              <Activity size={22} className="text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">System Observability Cockpit</h1>
              <p className="text-sm text-zinc-500 mt-0.5">Real-time metrics, cache hit levels, and token throughput timeline telemetry</p>
            </div>
          </div>

          <button
            onClick={() => fetchAnalytics(true)}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-semibold active:scale-[0.98] transition-all cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Sync
          </button>
        </header>

        {isLoading && !data ? (
          /* Initial loading page state */
          <div className="flex-1 flex flex-col items-center justify-center py-32 text-zinc-500 gap-3">
            <RefreshCw className="animate-spin text-cyan-400" size={32} />
            <p className="text-sm font-semibold">Parsing telemetry logs...</p>
          </div>
        ) : (
          <>
            {/* 1. Core KPIs Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4" style={animDelay(2)}>
              
              {/* Success Rate */}
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Success Rate</span>
                  <span className="text-3xl font-bold text-zinc-100 tabular-nums">{(data?.successRate ?? 100).toFixed(1)}%</span>
                  <span className="text-[10px] text-zinc-500">Total requests: {data?.totalRequests ?? 0}</span>
                </div>
                {renderRingGauge(data?.successRate ?? 100, 70, 6, "#10b981")}
              </div>

              {/* Avg Latency */}
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Avg Latency</span>
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                    <Clock size={14} className="text-indigo-400" />
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-indigo-400 tabular-nums">
                    {data?.avgTotalLatencyMs ? `${Math.round(data.avgTotalLatencyMs)}` : "—"}{" "}
                    <span className="text-sm font-semibold text-zinc-500">ms</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                    <Zap size={10} className="text-violet-400" />
                    First token: {data?.avgFirstTokenLatencyMs ? `${Math.round(data.avgFirstTokenLatencyMs)}` : "0"} ms
                  </div>
                </div>
              </div>

              {/* Token Throughput */}
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Token Output</span>
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <TrendingUp size={14} className="text-cyan-400" />
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-cyan-400 tabular-nums">
                    {data?.totalTokensOut ? `${data.totalTokensOut.toLocaleString()}` : "0"}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    Input volume: {data?.totalTokensIn ? `${data.totalTokensIn.toLocaleString()}` : "0"} tokens
                  </div>
                </div>
              </div>

              {/* Cache Efficiency */}
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Cache Hits</span>
                  <span className="text-3xl font-bold text-zinc-100 tabular-nums">{cacheHitRatio.toFixed(1)}%</span>
                  <span className="text-[10px] text-zinc-500">Hit count: {totalHits} requests</span>
                </div>
                {renderRingGauge(cacheHitRatio, 70, 6, "#6366f1")}
              </div>

            </div>

            {/* 2. Charts Section (Telemetry Timelines) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={animDelay(3)}>
              
              {/* Latency Timeline Chart */}
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4">
                <div>
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Latency Fluctuations (Last 50 Req)</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Tracking complete conversation generation response latency (in ms)</p>
                </div>
                <div className="h-44 w-full flex items-end pr-2 bg-zinc-950/30 border border-zinc-900/60 rounded-xl p-2">
                  {renderSVGLineChart(latencyPoints, 500, 160, "#818cf8")}
                </div>
              </div>

              {/* Token Throughput Timeline Chart */}
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4">
                <div>
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Token Volumes (Last 50 Req)</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Prompt + response token length per generation session</p>
                </div>
                <div className="h-44 w-full flex items-end pr-2 bg-zinc-950/30 border border-zinc-900/60 rounded-xl p-2">
                  {renderSVGLineChart(tokenPoints, 500, 160, "#22d3ee")}
                </div>
              </div>

            </div>

            {/* 3. Distribution Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={animDelay(4)}>
              
              {/* Cache hit level breakdown */}
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Database size={13} className="text-indigo-400" />
                  Cache Level Distribution
                </h3>
                <div className="flex flex-col gap-3">
                  {["L1", "L2", "L3", "none"].map((level) => {
                    const count = cacheStats[level] || 0;
                    const pct = totalCacheRequests > 0 ? (count / totalCacheRequests) * 100 : 0;
                    const colorClasses: Record<string, string> = {
                      L1: "bg-indigo-400",
                      L2: "bg-violet-400",
                      L3: "bg-purple-400",
                      none: "bg-zinc-800"
                    };

                    return (
                      <div key={level} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-zinc-300">{level === "none" ? "Uncached (None)" : `Level ${level}`}</span>
                          <span className="text-zinc-500 tabular-nums">{count} hits ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full h-2 bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${colorClasses[level] || "bg-zinc-700"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Model Usage Share */}
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu size={13} className="text-cyan-400" />
                  Model Allocations
                </h3>
                
                {Object.keys(data?.modelUsage || {}).length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-zinc-600 py-12">
                    No models registered in telemetry logs.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {Object.entries(data?.modelUsage || {}).map(([model, count]) => {
                      const totalAllocations = Object.values(data?.modelUsage || {}).reduce((a, b) => a + b, 0);
                      const pct = totalAllocations > 0 ? (count / totalAllocations) * 100 : 0;

                      return (
                        <div key={model} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-zinc-300 font-mono text-[11px]">{model}</span>
                            <span className="text-zinc-500 tabular-nums">{count} runs ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="w-full h-2 bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-cyan-400 transition-all duration-1000"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-zinc-700 py-4 mt-auto" style={animDelay(5)}>
          System Analytics telemetry synchronized · Candy.ai Observability
        </footer>

      </div>
    </div>
  );
}
