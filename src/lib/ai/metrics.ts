import fs from "fs";
import path from "path";
import { cacheStats } from "./cache";
import { getQueue } from "./trainingQueue";
import { getActiveModelId } from "./modelRegistry";

/**
 * Performance & Observability Telemetry Tracker
 * Measures and structures response phase timings, token volumes, and execution efficiency metrics.
 */

export interface TelemetryReport {
  sessionId: string;
  query: string;
  totalDurationMs: number;
  firstTokenDurationMs: number;
  searchDurationMs: number;
  memoryDurationMs: number;
  promptSizeTokens: number;
  responseSizeTokens: number;
  timestamp: string;
  modelUsed: string;
  cacheHitLevel: "L1" | "L2" | "L3" | "none";
  memoryHit: boolean;
  success: boolean;
}

class TelemetryTracker {
  private activeTimings = new Map<
    string,
    {
      start: number;
      marks: Record<string, number>;
      cacheSnapshot: { L1: number; L2: number; L3: number; misses: number };
    }
  >();

  startSession(requestId: string): void {
    this.activeTimings.set(requestId, {
      start: Date.now(),
      marks: {},
      cacheSnapshot: {
        L1: cacheStats.hitsL1,
        L2: cacheStats.hitsL2,
        L3: cacheStats.hitsL3,
        misses: cacheStats.misses
      }
    });
  }

  mark(requestId: string, metricName: string): void {
    const session = this.activeTimings.get(requestId);
    if (session) {
      session.marks[metricName] = Date.now() - session.start;
    }
  }

  endSession(
    requestId: string,
    details: {
      query: string;
      promptSize: number;
      responseSize: number;
      sessionId: string;
      modelUsed?: string;
      cacheHitLevel?: "L1" | "L2" | "L3" | "none";
      memoryHit?: boolean;
      success?: boolean;
    }
  ): TelemetryReport | null {
    const session = this.activeTimings.get(requestId);
    if (!session) return null;

    const totalDuration = Date.now() - session.start;
    const firstTokenDuration = session.marks["firstToken"] ?? 0;
    const searchDuration = session.marks["searchDuration"] ?? 0;
    const memoryDuration = session.marks["memoryDuration"] ?? 0;

    // Detect cache hit level using the cache delta snapshot
    const snapshot = session.cacheSnapshot;
    const diffL1 = cacheStats.hitsL1 - snapshot.L1;
    const diffL2 = cacheStats.hitsL2 - snapshot.L2;
    const diffL3 = cacheStats.hitsL3 - snapshot.L3;

    let cacheHitLevel: "L1" | "L2" | "L3" | "none" = details.cacheHitLevel ?? "none";
    if (cacheHitLevel === "none") {
      if (diffL1 > 0) {
        cacheHitLevel = "L1";
      } else if (diffL2 > 0) {
        cacheHitLevel = "L2";
      } else if (diffL3 > 0) {
        cacheHitLevel = "L3";
      }
    }

    // Determine if memory/RAG was hit
    const memoryHit =
      details.memoryHit ??
      ((session.marks["memoryDuration"] !== undefined && session.marks["memoryDuration"] > 0) || false);

    // Resolve model used
    let modelUsed = details.modelUsed;
    if (!modelUsed) {
      try {
        modelUsed = getActiveModelId();
      } catch (err) {
        modelUsed = "qwen2.5:0.5b"; // Safe fallback
      }
    }

    const success = details.success ?? (details.responseSize > 0);

    const report: TelemetryReport = {
      sessionId: details.sessionId,
      query: details.query,
      totalDurationMs: totalDuration,
      firstTokenDurationMs: firstTokenDuration,
      searchDurationMs: searchDuration,
      memoryDurationMs: memoryDuration,
      promptSizeTokens: details.promptSize,
      responseSizeTokens: details.responseSize,
      timestamp: new Date().toISOString(),
      modelUsed,
      cacheHitLevel,
      memoryHit,
      success
    };

    this.activeTimings.delete(requestId);
    this.printReport(report);
    this.writeToObservabilityLog(report);
    return report;
  }

  private printReport(report: TelemetryReport): void {
    console.log(`
========== [TELEMETRY METRICS SUMMARY] ==========
Query: "${report.query}"
⏱️  Total Response Time : ${report.totalDurationMs}ms
⚡ First Token Latency  : ${report.firstTokenDurationMs}ms
🔍 Search API Latency   : ${report.searchDurationMs}ms
💾 Vector Memory Latency: ${report.memoryDurationMs}ms
📏 Input Prompt Size   : ~${report.promptSizeTokens} tokens
✍️  Output Response Size: ~${report.responseSizeTokens} tokens
🤖 Model Used          : ${report.modelUsed}
📦 Cache Hit Level     : ${report.cacheHitLevel}
🧠 Memory Hit (RAG)     : ${report.memoryHit ? "YES" : "NO"}
=================================================
    `);
  }

  private writeToObservabilityLog(report: TelemetryReport): void {
    try {
      const logsDir = path.join(process.cwd(), "training", "logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const logFile = path.join(logsDir, "observability.jsonl");
      
      // Phase E schema format
      const logEntry = {
        timestamp: report.timestamp,
        sessionId: report.sessionId,
        query: report.query,
        latency: {
          total: report.totalDurationMs,
          first_token: report.firstTokenDurationMs,
          search: report.searchDurationMs,
          memory: report.memoryDurationMs
        },
        token_usage: {
          prompt: report.promptSizeTokens,
          response: report.responseSizeTokens
        },
        model_used: report.modelUsed,
        cache_hit_level: report.cacheHitLevel,
        memory_hit: report.memoryHit,
        success: report.success
      };

      const line = JSON.stringify(logEntry) + "\n";
      fs.appendFileSync(logFile, line, "utf8");
    } catch (e) {
      console.error("[TelemetryTracker] Failed to write observability log:", e);
    }
  }
}

export const telemetry = new TelemetryTracker();

export interface SystemHealthStats {
  errorRate: number;
  averageLatencyMs: number;
  totalTokenVolume: number;
  totalRequests: number;
  cacheHitDistribution: {
    L1: number;
    L2: number;
    L3: number;
    misses: number;
  };
  trainingFrequency: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    pendingJobs: number;
  };
}

/**
 * Aggregates running system statistics by scanning the observability logs
 * and combining with real-time cache and training queue metrics.
 */
export function getSystemHealthMetrics(): SystemHealthStats {
  const logFile = path.join(process.cwd(), "training", "logs", "observability.jsonl");
  let totalRequests = 0;
  let failedRequests = 0;
  let cumulativeLatency = 0;
  let totalTokenVolume = 0;
  
  let hitsL1 = cacheStats.hitsL1;
  let hitsL2 = cacheStats.hitsL2;
  let hitsL3 = cacheStats.hitsL3;
  let misses = cacheStats.misses;

  // Scan persistent JSONL logs to compute robust metrics over last 1000 requests
  if (fs.existsSync(logFile)) {
    try {
      const data = fs.readFileSync(logFile, "utf8");
      const lines = data.trim().split("\n").filter((l) => l.trim() !== "");
      
      const maxScan = 1000;
      const scanLines = lines.slice(-maxScan);
      
      let fileL1 = 0;
      let fileL2 = 0;
      let fileL3 = 0;
      let fileMisses = 0;
      let fileTotal = 0;
      let fileFailed = 0;
      let fileLatency = 0;
      let fileTokens = 0;

      for (const line of scanLines) {
        try {
          const entry = JSON.parse(line);
          fileTotal++;
          
          if (entry.success === false) {
            fileFailed++;
          }
          
          fileLatency += entry.latency?.total ?? 0;
          fileTokens += (entry.token_usage?.prompt ?? 0) + (entry.token_usage?.response ?? 0);
          
          const ch = entry.cache_hit_level;
          if (ch === "L1") fileL1++;
          else if (ch === "L2") fileL2++;
          else if (ch === "L3") fileL3++;
          else fileMisses++;
        } catch (e) {
          // Ignore parse errors on single lines
        }
      }

      if (fileTotal > 0) {
        totalRequests = fileTotal;
        failedRequests = fileFailed;
        cumulativeLatency = fileLatency;
        totalTokenVolume = fileTokens;
        
        hitsL1 = fileL1;
        hitsL2 = fileL2;
        hitsL3 = fileL3;
        misses = fileMisses;
      }
    } catch (e) {
      console.warn("[Metrics] Failed to read historical metrics file, using in-memory fallbacks:", e);
    }
  }

  // Retrieve training frequency and metrics from the queue
  let totalJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let pendingJobs = 0;
  try {
    const queue = getQueue();
    totalJobs = queue.length;
    completedJobs = queue.filter((j) => j.status === "completed").length;
    failedJobs = queue.filter((j) => j.status === "failed").length;
    pendingJobs = queue.filter((j) => j.status === "pending" || j.status === "running").length;
  } catch (e) {
    // Graceful ignore
  }

  const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0.0;
  const averageLatencyMs = totalRequests > 0 ? cumulativeLatency / totalRequests : 0.0;

  return {
    errorRate,
    averageLatencyMs,
    totalTokenVolume,
    totalRequests,
    cacheHitDistribution: {
      L1: hitsL1,
      L2: hitsL2,
      L3: hitsL3,
      misses: misses
    },
    trainingFrequency: {
      totalJobs,
      completedJobs,
      failedJobs,
      pendingJobs
    }
  };
}

