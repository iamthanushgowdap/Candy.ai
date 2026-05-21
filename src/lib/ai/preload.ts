/**
 * Model Preloading & Lifecycle Manager — Antgravity AI Engine
 *
 * Preloads target models to GPU VRAM in the background to reduce cold-start latency,
 * and unloads inactive models when resources are low.
 */

import { getAvailableModels } from "./modelRouter";

export class PreloadManager {
  private activePreloads = new Set<string>();

  /**
   * Instructs Ollama to load a model into VRAM immediately and keep it loaded
   * @param modelId Model identifier to preload
   * @returns boolean representing successful initiation
   */
  async preloadModel(modelId: string): Promise<boolean> {
    if (this.activePreloads.has(modelId)) return true;

    try {
      const available = await getAvailableModels();
      if (!available.includes(modelId)) {
        console.log(`[Preload] Cannot preload "${modelId}" — not pulled on local Ollama.`);
        return false;
      }

      console.log(`[Preload] Initiating background preloading for: ${modelId}`);
      this.activePreloads.add(modelId);

      // Call Ollama empty generate with -1 keep_alive to load model
      fetch(`${process.env.NEXT_PUBLIC_OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          model: modelId,
          prompt: "",
          keep_alive: -1 // Keep loaded indefinitely
        })
      }).catch((e) => {
        console.warn(`[Preload] Background loading request ended for ${modelId}:`, e.message);
      }).finally(() => {
        this.activePreloads.delete(modelId);
      });

      return true;
    } catch (err: any) {
      console.warn(`[Preload] Failed to initiate preload for ${modelId}:`, err);
      this.activePreloads.delete(modelId);
      return false;
    }
  }

  /**
   * Instructs Ollama to unload a model from VRAM immediately (keep_alive: 0)
   * @param modelId Model identifier to unload
   */
  async unloadModel(modelId: string): Promise<boolean> {
    try {
      console.log(`[Preload] Releasing VRAM for model: ${modelId}`);
      const res = await fetch(`${process.env.NEXT_PUBLIC_OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          model: modelId,
          prompt: "",
          keep_alive: 0 // Unload immediately
        })
      });
      return res.ok;
    } catch (err: any) {
      console.warn(`[Preload] Failed to unload model ${modelId}:`, err);
      return false;
    }
  }
}

export const preloadManager = new PreloadManager();
