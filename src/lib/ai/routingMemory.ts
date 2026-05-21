/**
 * Routing Memory & Switch Threshold Manager — Antgravity AI Engine
 *
 * Tracks model allocation history per chat session to maintain conversational continuity,
 * avoid rapid model-flipping, and enforce cooling-off periods when in deep workflows.
 */

export interface SessionMemoryState {
  lastAllocatedModel: string;
  workflowMode: "casual" | "coding" | "reasoning";
  messageCountInMode: number;
  lastSwitchTimeMs: number;
}

class RoutingMemoryManager {
  private sessionStates = new Map<string, SessionMemoryState>();
  private readonly SWITCH_COOLDOWN_MS = 120000; // 2 minutes cooldown
  private readonly MIN_WORKFLOW_MESSAGES = 3;   // Lock model for at least 3 messages

  /** Initialize or retrieve session state */
  getOrCreateState(sessionId: string, initialModel: string): SessionMemoryState {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = {
        lastAllocatedModel: initialModel,
        workflowMode: "casual",
        messageCountInMode: 0,
        lastSwitchTimeMs: Date.now()
      };
      this.sessionStates.set(sessionId, state);
    }
    return state;
  }

  /**
   * Evaluates if switching from current model to candidate model is allowed.
   * If in cooldown or minimum message count in workflow mode, locks current model.
   */
  shouldSwitchModel(
    sessionId: string,
    currentModel: string,
    candidateModel: string,
    candidateMode: "casual" | "coding" | "reasoning",
    confidence: number
  ): { allowed: boolean; modelToUse: string } {
    const state = this.getOrCreateState(sessionId, currentModel);
    const now = Date.now();

    // No switch needed
    if (currentModel === candidateModel) {
      state.messageCountInMode++;
      return { allowed: false, modelToUse: currentModel };
    }

    // Force override if routing confidence is exceptionally high (>0.90)
    if (confidence >= 0.90) {
      console.log(`[RoutingMemory] Force routing switch to "${candidateModel}" due to high confidence: ${confidence}`);
      this.updateState(sessionId, candidateModel, candidateMode, now);
      return { allowed: true, modelToUse: candidateModel };
    }

    // 1. Minimum message constraint in workflow mode
    if (
      (state.workflowMode === "coding" || state.workflowMode === "reasoning") &&
      state.messageCountInMode < this.MIN_WORKFLOW_MESSAGES
    ) {
      console.log(
        `[RoutingMemory] Lock active workflow model "${currentModel}" (message ${state.messageCountInMode}/${this.MIN_WORKFLOW_MESSAGES})`
      );
      state.messageCountInMode++;
      return { allowed: false, modelToUse: currentModel };
    }

    // 2. Cooldown timer check
    const timeElapsed = now - state.lastSwitchTimeMs;
    if (timeElapsed < this.SWITCH_COOLDOWN_MS) {
      console.log(
        `[RoutingMemory] Switch to "${candidateModel}" throttled. Cooldown remaining: ${Math.round(
          (this.SWITCH_COOLDOWN_MS - timeElapsed) / 1000
        )}s`
      );
      state.messageCountInMode++;
      return { allowed: false, modelToUse: currentModel };
    }

    // Allow switch and update internal record
    console.log(`[RoutingMemory] Switch allowed from "${currentModel}" to "${candidateModel}"`);
    this.updateState(sessionId, candidateModel, candidateMode, now);
    return { allowed: true, modelToUse: candidateModel };
  }

  private updateState(
    sessionId: string,
    model: string,
    mode: "casual" | "coding" | "reasoning",
    timestamp: number
  ) {
    this.sessionStates.set(sessionId, {
      lastAllocatedModel: model,
      workflowMode: mode,
      messageCountInMode: 1,
      lastSwitchTimeMs: timestamp
    });
  }

  /** Force reset session memory when starting new chat threads */
  clearSessionMemory(sessionId: string): void {
    this.sessionStates.delete(sessionId);
  }
}

export const routingMemoryManager = new RoutingMemoryManager();
