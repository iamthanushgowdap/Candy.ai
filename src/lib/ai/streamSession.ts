/**
 * Stream Session Model Lock Manager — Antgravity AI Engine
 *
 * Ensures streaming requests bind to a single allocated model instance,
 * preventing mid-stream switches and race conditions during fast inputs.
 */

export class StreamSessionManager {
  private activeStreams = new Map<string, string>(); // sessionId -> modelId

  /** Lock a model to a session during active streaming */
  lockSessionModel(sessionId: string, modelId: string): void {
    this.activeStreams.set(sessionId, modelId);
    console.log(`[StreamSession] Locked session "${sessionId}" to model "${modelId}"`);
  }

  /** Retrieve the locked model for a session, if any */
  getLockedModel(sessionId: string): string | undefined {
    return this.activeStreams.get(sessionId);
  }

  /** Release the lock when the stream completes */
  releaseSessionModel(sessionId: string): void {
    if (this.activeStreams.has(sessionId)) {
      this.activeStreams.delete(sessionId);
      console.log(`[StreamSession] Released lock on session "${sessionId}"`);
    }
  }

  /** Check if a session has an active stream lock */
  isSessionLocked(sessionId: string): boolean {
    return this.activeStreams.has(sessionId);
  }
}

export const streamSessionManager = new StreamSessionManager();
