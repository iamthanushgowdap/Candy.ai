import { NextRequest, NextResponse } from "next/server";
import { runMemoryCleaning } from "@/lib/ai/memoryCleaner";

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      // Ignore parse failure
    }

    const url = new URL(req.url);
    const dryRun = body.dryRun ?? url.searchParams.get("dryRun") === "true";

    console.log(`[API /api/admin/memory-clean] Triggering memory cleaning job. DryRun:`, dryRun);

    const report = await runMemoryCleaning(dryRun);
    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    console.error("Admin memory cleaning error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute memory cleaning" },
      { status: 500 }
    );
  }
}
