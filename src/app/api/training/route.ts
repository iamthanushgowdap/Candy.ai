import { NextRequest, NextResponse } from "next/server";
import { getQueue, isTrainingLocked } from "@/lib/ai/trainingQueue";
import { runAutoTrainingCycle } from "@/lib/ai/autoTrainer";

export async function GET(req: NextRequest) {
  try {
    const queue = getQueue();
    const locked = isTrainingLocked();

    const pending = queue.filter(j => j.status === "pending");
    const running = queue.filter(j => j.status === "running");
    const completed = queue.filter(j => j.status === "completed");
    const failed = queue.filter(j => j.status === "failed");

    return NextResponse.json({
      isLocked: locked,
      stats: {
        pending: pending.length,
        running: running.length,
        completed: completed.length,
        failed: failed.length,
        total: queue.length
      },
      jobs: queue.slice(-30).reverse() // Return last 30 jobs newest-first
    });
  } catch (err: any) {
    console.error("[TrainingAPI] GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch training queue" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, smokeTest, forceTrain } = body;

    if (action !== "trigger") {
      return NextResponse.json({ error: "Invalid action. Use 'trigger'." }, { status: 400 });
    }

    // Fire-and-forget — don't await so the UI gets a quick acknowledgment
    const reportPromise = runAutoTrainingCycle({
      smokeTest: smokeTest ?? true,
      forceTrain: forceTrain ?? false,
      minSamples: 1
    });

    reportPromise.then(report => {
      console.log("[TrainingAPI] Manual trigger complete:", report.actionTaken);
    }).catch(err => {
      console.error("[TrainingAPI] Manual trigger error:", err);
    });

    return NextResponse.json({ success: true, message: "Training job enqueued. Check the queue for status." });
  } catch (err: any) {
    console.error("[TrainingAPI] POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to trigger training" }, { status: 500 });
  }
}
