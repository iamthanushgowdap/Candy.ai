import { NextRequest, NextResponse } from "next/server";
import { rollbackToPreviousModel } from "@/lib/ai/modelRegistry";

export async function POST(req: NextRequest) {
  try {
    console.log(`[API /api/admin/rollback] Triggering model registry rollback...`);
    const result = rollbackToPreviousModel();
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to rollback model" },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Admin model rollback error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to rollback to previous model" },
      { status: 500 }
    );
  }
}
