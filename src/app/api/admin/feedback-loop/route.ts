import { NextRequest, NextResponse } from "next/server";
import { curateFeedbackDataset } from "@/lib/ai/feedbackLoop";

export async function POST(req: NextRequest) {
  try {
    const result = await curateFeedbackDataset();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("Admin feedback loop curation error:", err);
    return NextResponse.json({ error: err.message || "Failed to curate feedback loop datasets" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const result = await curateFeedbackDataset();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("Admin feedback loop curation error:", err);
    return NextResponse.json({ error: err.message || "Failed to curate feedback loop datasets" }, { status: 500 });
  }
}
