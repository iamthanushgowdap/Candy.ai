import fs from "fs";
import path from "path";

/**
 * Model Capability Registry — Antgravity AI Engine
 *
 * Centralized registry mapping every supported local model to its hardware profiles,
 * context suggestions, strengths, weaknesses, and performance characteristics.
 */

export interface ModelEntry {
  id: string;
  name: string;
  category: "conversational" | "coding" | "reasoning" | "routing" | "summarization" | "embeddings";
  vramRequiredGb: number;
  maxContextRecommend: number;
  relativeSpeedScore: number; // 1-10 (10 = fastest)
  strengths: string[];
  weaknesses: string[];
  preferredTasks: string[];
  description: string;
  latencyProfile: "ultra-low" | "low" | "medium" | "high";
  isEmbeddingOnly?: boolean;
}

export const STATIC_MODEL_REGISTRY: Record<string, ModelEntry> = {
  "qwen2.5:0.5b": {
    id: "qwen2.5:0.5b",
    name: "Qwen 2.5 (0.5B)",
    category: "routing",
    vramRequiredGb: 0.8,
    maxContextRecommend: 4096,
    relativeSpeedScore: 10,
    strengths: ["ultra-fast greetings", "low VRAM footprint", "routing decisions", "short casual replies"],
    weaknesses: ["poor complex reasoning", "short-context limits", "lacks deep coding ability"],
    preferredTasks: ["greeting", "short_reply", "simple_qa", "intent_routing"],
    description: "Ultra-lightweight model optimized for rapid classification and basic conversational greetings.",
    latencyProfile: "ultra-low"
  },
  "qwen2.5:3b": {
    id: "qwen2.5:3b",
    name: "Qwen 2.5 (3B)",
    category: "conversational",
    vramRequiredGb: 2.8,
    maxContextRecommend: 8192,
    relativeSpeedScore: 7,
    strengths: ["balanced conversation", "general analysis", "medium-length queries"],
    weaknesses: ["complex coding structures", "very long contexts"],
    preferredTasks: ["conversational", "general_qa", "summarization"],
    description: "Balanced intermediate conversational engine offering low-latency general reasoning.",
    latencyProfile: "low"
  },
  "gemma3:4b": {
    id: "gemma3:4b",
    name: "Gemma 3 (4B)",
    category: "reasoning",
    vramRequiredGb: 3.6,
    maxContextRecommend: 16384,
    relativeSpeedScore: 5,
    strengths: ["complex logic", "deep explanations", "structured analysis", "philosophical discussion"],
    weaknesses: ["higher startup delay", "higher VRAM footprint"],
    preferredTasks: ["complex_reasoning", "deep_analysis", "creative_writing", "extended_chat"],
    description: "Highly capable local reasoning model for deep context processing and structural logic.",
    latencyProfile: "medium"
  },
  "qwen2.5-coder:3b": {
    id: "qwen2.5-coder:3b",
    name: "Qwen 2.5 Coder (3B)",
    category: "coding",
    vramRequiredGb: 3.0,
    maxContextRecommend: 8192,
    relativeSpeedScore: 6,
    strengths: ["syntax accuracy", "CSS/HTML design templates", "logical algorithms", "debugging feedback"],
    weaknesses: ["conversational variety", "poetic styling"],
    preferredTasks: ["code_generation", "architectural_design", "debugging", "schema_definition"],
    description: "Specialized developer assistant tuned for code creation, system debugging, and styling layout tasks.",
    latencyProfile: "low"
  },
  "nomic-embed-text:latest": {
    id: "nomic-embed-text:latest",
    name: "Nomic Embed Text",
    category: "embeddings",
    vramRequiredGb: 0.3,
    maxContextRecommend: 8192,
    relativeSpeedScore: 9,
    strengths: ["semantic search", "retrieval ranking"],
    weaknesses: ["not a chat model"],
    preferredTasks: ["embedding_generation"],
    description: "Semantic embedding engine for vector processing and memory search indexing.",
    latencyProfile: "ultra-low",
    isEmbeddingOnly: true
  },
  "antgravity": {
    id: "antgravity",
    name: "Antgravity (Custom)",
    category: "conversational",
    vramRequiredGb: 2.5,
    maxContextRecommend: 4096,
    relativeSpeedScore: 7,
    strengths: [
      "specialized conversational behavior",
      "emotional intelligence",
      "natural interaction style",
      "long-form multi-turn conversations",
      "memory recall integration",
      "personal advice",
      "nuanced reasoning"
    ],
    weaknesses: ["complex coding structures", "very long contexts (>4096)"],
    preferredTasks: [
      "deep_conversation", "emotional_support", "personal_advice",
      "complex_reasoning", "creative_writing", "general_qa"
    ],
    description: "Antgravity's own custom fine-tuned conversational layer — built on Qwen2.5-3B-Instruct with QLoRA specialization for premium interaction quality. Trained on curated high-quality dialogue datasets and continuously improved via the self-improvement pipeline.",
    latencyProfile: "low"
  }
};

export const MODEL_REGISTRY = STATIC_MODEL_REGISTRY;

const REGISTRY_FILE = path.join(process.cwd(), "training", "models", "registry.json");

export interface RegistryState {
  activeModel: string;
  models: Record<string, {
    id: string;
    name: string;
    path: string;
    status: "deployed" | "rejected" | "ready";
    trained_at: string;
    metrics: { accuracy: number; quality: number; reasoning: number; latency_ms: number };
  }>;
  history: Array<{
    event: string;
    modelId: string;
    timestamp: string;
    notes?: string;
  }>;
}

export function loadRegistryState(): RegistryState {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const content = fs.readFileSync(REGISTRY_FILE, "utf8");
      return JSON.parse(content) as RegistryState;
    }
  } catch (e) {
    console.error("[ModelRegistry] Failed to load registry.json state:", e);
  }
  return {
    activeModel: "qwen2.5:0.5b",
    models: {
      "qwen2.5:0.5b": {
        id: "qwen2.5:0.5b",
        name: "Qwen 2.5 (0.5B)",
        path: "qwen2.5:0.5b",
        status: "deployed",
        trained_at: new Date().toISOString(),
        metrics: { accuracy: 7.0, quality: 7.0, reasoning: 6.5, latency_ms: 500 }
      }
    },
    history: []
  };
}

export function saveRegistryState(state: RegistryState): void {
  try {
    const dir = path.dirname(REGISTRY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("[ModelRegistry] Failed to save registry.json state:", e);
  }
}

/** Get the currently active model ID in production */
export function getActiveModelId(): string {
  const state = loadRegistryState();
  return state.activeModel || "qwen2.5:0.5b";
}

/** Register a newly trained model version */
export function registerNewModel(
  id: string,
  name: string,
  pathName: string,
  metrics: { accuracy: number; quality: number; reasoning: number; latency_ms: number },
  status: "deployed" | "rejected" | "ready" = "ready"
): void {
  const state = loadRegistryState();
  
  state.models[id] = {
    id,
    name,
    path: pathName,
    status,
    trained_at: new Date().toISOString(),
    metrics
  };

  state.history.push({
    event: status === "deployed" ? "deployed" : "registered",
    modelId: id,
    timestamp: new Date().toISOString(),
    notes: `Model registered with status ${status}. Quality: ${metrics.quality.toFixed(2)}`
  });

  if (status === "deployed") {
    state.activeModel = id;
  }

  saveRegistryState(state);
  console.log(`[ModelRegistry] Registered model: ${id} with status: ${status}`);
}

/** Switch the active model automatically */
export function switchActiveModel(modelId: string, notes?: string): boolean {
  const state = loadRegistryState();
  if (!state.models[modelId]) {
    console.error(`[ModelRegistry] Cannot switch to unregistered model: ${modelId}`);
    return false;
  }

  const oldModel = state.activeModel;
  state.activeModel = modelId;
  state.models[modelId].status = "deployed";
  
  state.history.push({
    event: "deployed",
    modelId,
    timestamp: new Date().toISOString(),
    notes: notes || `Dynamic model hot-swap from ${oldModel} to ${modelId}`
  });

  saveRegistryState(state);
  console.log(`[ModelRegistry] Successfully hot-swapped production model to: ${modelId}`);
  return true;
}

/** Rollback to the previous active model version in deployment history */
export function rollbackToPreviousModel(): { success: boolean; rolledBackTo?: string; error?: string } {
  const state = loadRegistryState();
  const deployments = state.history.filter(h => h.event === "deployed" && h.modelId !== state.activeModel);
  
  if (deployments.length === 0) {
    // If no explicit deployment history, fall back to base model
    if (state.activeModel !== "qwen2.5:0.5b") {
      const success = switchActiveModel("qwen2.5:0.5b", "Emergency rollback to base model");
      return { success, rolledBackTo: "qwen2.5:0.5b" };
    }
    return { success: false, error: "No previous models found to roll back to" };
  }

  const previousDeployment = deployments[deployments.length - 1];
  const targetId = previousDeployment.modelId;
  const success = switchActiveModel(targetId, `Rollback triggered from ${state.activeModel}`);
  return { success, rolledBackTo: targetId };
}

/** Get specs for any model name, with dynamic adapter resolution */
export function getModelSpecs(modelId: string): ModelEntry | undefined {
  const state = loadRegistryState();
  
  // Check if it is a dynamically registered model
  const dynamicModel = state.models[modelId];
  if (dynamicModel) {
    return {
      id: dynamicModel.id,
      name: dynamicModel.name,
      category: "conversational",
      vramRequiredGb: 2.2, // LoRA adapter overlay footprint is low on base model
      maxContextRecommend: 4096,
      relativeSpeedScore: 8,
      strengths: ["specialized conversational behaviors", "reinforce learning metrics", "highly tailored style"],
      weaknesses: ["complex coding structures", "VRAM limits"],
      preferredTasks: ["conversational", "general_qa"],
      description: `Dynamic dynamic LoRA fine-tuned model checkpoint deployed on top of ${dynamicModel.path}.`,
      latencyProfile: "low"
    };
  }

  return STATIC_MODEL_REGISTRY[modelId] || Object.values(STATIC_MODEL_REGISTRY).find(m => modelId.startsWith(m.id) || m.id.startsWith(modelId));
}

/** Get context length limit with safety headroom */
export function getRecommendedContextLimit(modelId: string): number {
  const specs = getModelSpecs(modelId);
  return specs ? specs.maxContextRecommend : 4096;
}

