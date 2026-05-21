import { NextRequest, NextResponse } from "next/server";
import { getSystemHealthMetrics } from "@/lib/ai/metrics";
import { getActiveModelId } from "@/lib/ai/modelRegistry";
import { getActiveVramUsage } from "@/lib/ai/modelRouter";
import { isTrainingLocked, getQueue } from "@/lib/ai/trainingQueue";

export async function GET(req: NextRequest) {
  try {
    // 1. Get system health metrics (performance diagnostics, cache distribution, training frequency)
    const metrics = getSystemHealthMetrics();

    // 2. Get active model ID
    const activeModelId = getActiveModelId();

    // 3. Get active VRAM usage from Ollama
    const vramInfo = await getActiveVramUsage();
    const usedVramGb = vramInfo.usageBytes / (1024 * 1024 * 1024);
    const totalVramGb = 4.0; // RTX 2050 4GB VRAM
    const availableVramGb = Math.max(0, totalVramGb - usedVramGb);

    // 4. Get training status and queue length
    const queue = getQueue();
    const activeTrainingLock = isTrainingLocked();

    const totalCacheAccesses =
      metrics.cacheHitDistribution.L1 +
      metrics.cacheHitDistribution.L2 +
      metrics.cacheHitDistribution.L3 +
      metrics.cacheHitDistribution.misses;

    const hitRatioPct =
      totalCacheAccesses > 0
        ? ((metrics.cacheHitDistribution.L1 +
            metrics.cacheHitDistribution.L2 +
            metrics.cacheHitDistribution.L3) /
            totalCacheAccesses) *
          100
        : 0.0;

    const response = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      activeModel: {
        id: activeModelId,
        loadedInVram: vramInfo.loadedModels.includes(activeModelId),
      },
      diagnostics: {
        errorRatePct: parseFloat(metrics.errorRate.toFixed(2)),
        averageLatencyMs: parseFloat(metrics.averageLatencyMs.toFixed(2)),
        totalTokenVolume: metrics.totalTokenVolume,
        totalRequests: metrics.totalRequests,
      },
      cache: {
        hitsL1: metrics.cacheHitDistribution.L1,
        hitsL2: metrics.cacheHitDistribution.L2,
        hitsL3: metrics.cacheHitDistribution.L3,
        misses: metrics.cacheHitDistribution.misses,
        hitRatioPct: parseFloat(hitRatioPct.toFixed(2))
      },
      hardware: {
        gpuName: "NVIDIA GeForce RTX 2050 (Estimated)",
        totalVramGb,
        usedVramGb: parseFloat(usedVramGb.toFixed(3)),
        availableVramGb: parseFloat(availableVramGb.toFixed(3)),
        loadedModels: vramInfo.loadedModels,
      },
      training: {
        isCurrentlyTraining: activeTrainingLock,
        queueLength: queue.filter((j) => j.status === "pending").length,
        jobsStats: metrics.trainingFrequency
      }
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("[SystemHealthAPI] Failed to get system health diagnostics:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve system health diagnostics" },
      { status: 500 }
    );
  }
}
