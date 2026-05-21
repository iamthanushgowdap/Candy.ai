import { NextRequest, NextResponse } from "next/server";
import { loadRegistryState, switchActiveModel, rollbackToPreviousModel } from "@/lib/ai/modelRegistry";
import { getAvailableModels } from "@/lib/ai/modelRouter";

export async function GET(req: NextRequest) {
  try {
    const registryState = loadRegistryState();
    const ollamaModels = await getAvailableModels();

    return NextResponse.json({
      activeModel: registryState.activeModel,
      registeredModels: registryState.models,
      history: registryState.history,
      availableOllamaModels: ollamaModels
    });
  } catch (err: any) {
    console.error("[ModelsAPI] GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to load models list" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, modelId, notes } = body;

    if (action === "rollback") {
      const rollbackResult = rollbackToPreviousModel();
      if (rollbackResult.success) {
        return NextResponse.json({ success: true, activeModel: rollbackResult.rolledBackTo });
      } else {
        return NextResponse.json({ error: rollbackResult.error || "Rollback failed" }, { status: 400 });
      }
    }

    if (action === "switch") {
      if (!modelId) {
        return NextResponse.json({ error: "Missing modelId for switch action" }, { status: 400 });
      }

      const success = switchActiveModel(modelId, notes);
      if (success) {
        return NextResponse.json({ success: true, activeModel: modelId });
      } else {
        return NextResponse.json({ error: "Failed to switch active model. Ensure model is registered." }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Invalid action. Supported actions are 'switch' or 'rollback'" }, { status: 400 });
  } catch (err: any) {
    console.error("[ModelsAPI] POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to update active model" }, { status: 500 });
  }
}
