import { NextRequest, NextResponse } from "next/server";
import { runAutoTrainingCycle } from "@/lib/ai/autoTrainer";

export async function POST(req: NextRequest) {
  try {
    // Parse body optionally, fallback to query params
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      // Ignore parse failure (no body provided)
    }

    const url = new URL(req.url);
    const smokeTest = body.smokeTest ?? url.searchParams.get("smokeTest") === "true";
    const forceTrain = body.forceTrain ?? url.searchParams.get("forceTrain") === "true";
    
    const minSamplesParam = body.minSamples ?? url.searchParams.get("minSamples");
    const minSamples = minSamplesParam !== undefined && minSamplesParam !== null ? parseInt(String(minSamplesParam), 10) : undefined;
    
    const minQualityParam = body.minQuality ?? url.searchParams.get("minQuality");
    const minQuality = minQualityParam !== undefined && minQualityParam !== null ? parseFloat(String(minQualityParam)) : undefined;

    console.log(`[API /api/admin/auto-train] Triggering auto training. options:`, {
      smokeTest,
      forceTrain,
      minSamples,
      minQuality
    });

    const report = await runAutoTrainingCycle({
      smokeTest,
      forceTrain,
      minSamples: isNaN(minSamples as any) ? undefined : minSamples,
      minQuality: isNaN(minQuality as any) ? undefined : minQuality,
    });

    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    console.error("Admin auto-train cycle execution error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute auto-training cycle" },
      { status: 500 }
    );
  }
}
