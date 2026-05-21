import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  try {
    const logFile = path.join(process.cwd(), "training", "logs", "observability.jsonl");

    if (!fs.existsSync(logFile)) {
      return NextResponse.json({
        totalRequests: 0,
        successRate: 100,
        avgTotalLatencyMs: 0,
        avgFirstTokenLatencyMs: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        cacheHits: { L1: 0, L2: 0, L3: 0, none: 0 },
        modelUsage: {},
        latencyTimeline: [],
        tokenTimeline: []
      });
    }

    const raw = fs.readFileSync(logFile, "utf8");
    const lines = raw.trim().split("\n").filter(l => l.trim());
    const MAX_SCAN = 500;
    const entries = lines.slice(-MAX_SCAN).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    let totalRequests = entries.length;
    let successCount = 0;
    let sumTotal = 0;
    let sumFirstToken = 0;
    let totalIn = 0;
    let totalOut = 0;
    const cacheHits: Record<string, number> = { L1: 0, L2: 0, L3: 0, none: 0 };
    const modelUsage: Record<string, number> = {};
    const latencyTimeline: { ts: string; ms: number }[] = [];
    const tokenTimeline: { ts: string; tokens: number }[] = [];

    for (const e of entries) {
      if (e.success !== false) successCount++;
      const totalMs = e.latency?.total ?? 0;
      const firstMs = e.latency?.first_token ?? 0;
      sumTotal += totalMs;
      sumFirstToken += firstMs;
      totalIn += e.token_usage?.prompt ?? 0;
      totalOut += e.token_usage?.response ?? 0;

      const ch = e.cache_hit_level ?? "none";
      cacheHits[ch] = (cacheHits[ch] || 0) + 1;

      const m = e.model_used || "unknown";
      modelUsage[m] = (modelUsage[m] || 0) + 1;

      if (e.timestamp) {
        latencyTimeline.push({ ts: e.timestamp, ms: totalMs });
        tokenTimeline.push({ ts: e.timestamp, tokens: (e.token_usage?.prompt ?? 0) + (e.token_usage?.response ?? 0) });
      }
    }

    return NextResponse.json({
      totalRequests,
      successRate: totalRequests > 0 ? parseFloat(((successCount / totalRequests) * 100).toFixed(1)) : 100,
      avgTotalLatencyMs: totalRequests > 0 ? parseFloat((sumTotal / totalRequests).toFixed(1)) : 0,
      avgFirstTokenLatencyMs: totalRequests > 0 ? parseFloat((sumFirstToken / totalRequests).toFixed(1)) : 0,
      totalTokensIn: totalIn,
      totalTokensOut: totalOut,
      cacheHits,
      modelUsage,
      latencyTimeline: latencyTimeline.slice(-50),
      tokenTimeline: tokenTimeline.slice(-50)
    });
  } catch (err: any) {
    console.error("[AnalyticsAPI] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to compute analytics" }, { status: 500 });
  }
}
