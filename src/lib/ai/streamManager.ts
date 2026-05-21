/**
 * Progressive Stream & Recovery Manager
 * Handles streaming lifecycle, timeout detection, cancellation triggers, and graceful recovery fallbacks.
 */

export interface StreamEvent {
  type: "token" | "done" | "error" | "status";
  data: string;
}

export class StreamManager {
  private activeControllers = new Map<string, AbortController>();

  createController(requestId: string): AbortController {
    // Abort existing request with same ID if any
    this.abortRequest(requestId);

    const controller = new AbortController();
    this.activeControllers.set(requestId, controller);
    return controller;
  }

  abortRequest(requestId: string): void {
    const controller = this.activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(requestId);
      console.log(`[StreamManager] Interrupted active generation request: ${requestId}`);
    }
  }

  getController(requestId: string): AbortController | undefined {
    return this.activeControllers.get(requestId);
  }

  removeController(requestId: string): void {
    this.activeControllers.delete(requestId);
  }
}

export const streamManager = new StreamManager();
