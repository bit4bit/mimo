import { SessionManager } from "./session.js";
import { AcpClient, IAcpProvider } from "./acp/index.js";
import type { ModelState, ModeState } from "./types.js";

export type AcpSessionState = "active" | "parked" | "waking";

export interface CachedAcpState {
  acpSessionId?: string;
  modelState?: ModelState;
  modeState?: ModeState;
}

export interface QueuedPrompt {
  content: string;
  resolve: (value: void) => void;
  reject: (reason: Error) => void;
}

export interface SessionLifecycleCallbacks {
  onStatusChange: (sessionId: string, status: AcpSessionState) => void;
  onCacheState: (sessionId: string, state: CachedAcpState) => void;
  onGetCachedState: (sessionId: string) => CachedAcpState | undefined;
  onSpawnAcp: (sessionId: string, cachedState?: CachedAcpState) => Promise<AcpClient | null>;
  onTerminateSession: (sessionId: string) => Promise<void>;
}

export class SessionLifecycleManager {
  private sessionStates: Map<string, AcpSessionState> = new Map();
  private lastActivity: Map<string, number> = new Map();
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();
  private promptQueues: Map<string, QueuedPrompt[]> = new Map();
  private idleTimeouts: Map<string, number> = new Map();
  private callbacks: SessionLifecycleCallbacks;

  constructor(callbacks: SessionLifecycleCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Initialize lifecycle management for a session
   */
  initializeSession(sessionId: string, idleTimeoutMs: number): void {
    this.idleTimeouts.set(sessionId, idleTimeoutMs);
    this.sessionStates.set(sessionId, "active");
    this.lastActivity.set(sessionId, Date.now());
    
    if (idleTimeoutMs > 0) {
      this.startIdleTimer(sessionId, idleTimeoutMs);
    }
  }

  /**
   * Update idle timeout for a session
   */
  updateIdleTimeout(sessionId: string, idleTimeoutMs: number): void {
    this.idleTimeouts.set(sessionId, idleTimeoutMs);
    
    // Clear existing timer
    const existingTimer = this.idleTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.idleTimers.delete(sessionId);
    }

    // Start new timer if not zero and session is active
    if (idleTimeoutMs > 0 && this.getSessionState(sessionId) === "active") {
      this.startIdleTimer(sessionId, idleTimeoutMs);
    }
  }

  /**
   * Record activity for a session (resets idle timer)
   */
  recordActivity(sessionId: string): void {
    const currentState = this.getSessionState(sessionId);
    if (currentState === "active") {
      this.lastActivity.set(sessionId, Date.now());
      
      // Reset the timer
      const idleTimeoutMs = this.idleTimeouts.get(sessionId) ?? 600000;
      if (idleTimeoutMs > 0) {
        this.startIdleTimer(sessionId, idleTimeoutMs);
      }
    }
  }

  /**
   * Get current state for a session
   */
  getSessionState(sessionId: string): AcpSessionState {
    return this.sessionStates.get(sessionId) ?? "active";
  }

  /**
   * Check if session is ready to receive prompts
   */
  isSessionReady(sessionId: string): boolean {
    const state = this.getSessionState(sessionId);
    return state === "active";
  }

  /**
   * Queue a prompt for processing
   * Returns a promise that resolves when the prompt is actually sent
   */
  async queuePrompt(sessionId: string, content: string): Promise<void> {
    const state = this.getSessionState(sessionId);

    if (state === "active") {
      // Session is ready, record activity and return immediately
      this.recordActivity(sessionId);
      return;
    }

    if (state === "parked") {
      // Need to wake up the session first
      return this.wakeAndQueuePrompt(sessionId, content);
    }

    if (state === "waking") {
      // Already waking up, just queue the prompt
      return this.addToQueue(sessionId, content);
    }

    return Promise.reject(new Error(`Unknown session state: ${state}`));
  }

  /**
   * Mark session as ended and cleanup
   */
  endSession(sessionId: string): void {
    // Clear timer
    const timer = this.idleTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(sessionId);
    }

    // Clear any queued prompts
    const queue = this.promptQueues.get(sessionId);
    if (queue) {
      for (const prompt of queue) {
        prompt.reject(new Error("Session ended"));
      }
      this.promptQueues.delete(sessionId);
    }

    // Remove session data
    this.sessionStates.delete(sessionId);
    this.lastActivity.delete(sessionId);
    this.idleTimeouts.delete(sessionId);
  }

  private startIdleTimer(sessionId: string, idleTimeoutMs: number): void {
    // Clear existing timer
    const existingTimer = this.idleTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.parkSession(sessionId);
    }, idleTimeoutMs);

    this.idleTimers.set(sessionId, timer);
  }

  private async parkSession(sessionId: string): Promise<void> {
    const currentState = this.getSessionState(sessionId);
    if (currentState !== "active") {
      return; // Already parked or waking
    }

    // Set state to parked
    this.setSessionState(sessionId, "parked");

    // Clear the timer since we're now parked
    const timer = this.idleTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(sessionId);
    }

    // Gracefully close the ACP client, then clean up the process
    await this.callbacks.onTerminateSession(sessionId);

    // Notify of status change
    this.callbacks.onStatusChange(sessionId, "parked");
  }

  private setSessionState(sessionId: string, state: AcpSessionState): void {
    this.sessionStates.set(sessionId, state);
  }

  private async wakeAndQueuePrompt(sessionId: string, content: string): Promise<void> {
    // Set state to waking
    this.setSessionState(sessionId, "waking");
    this.callbacks.onStatusChange(sessionId, "waking");

    // Add prompt to queue before waking (ensures it's processed)
    const queuePromise = this.addToQueue(sessionId, content);

    try {
      // Get cached state and respawn ACP
      const cachedState = this.callbacks.onGetCachedState(sessionId);
      const acpClient = await this.callbacks.onSpawnAcp(sessionId, cachedState);

      if (!acpClient) {
        throw new Error("Failed to spawn ACP process");
      }

      // Session is now active
      this.setSessionState(sessionId, "active");
      this.lastActivity.set(sessionId, Date.now());
      
      // Restart idle timer
      const idleTimeoutMs = this.idleTimeouts.get(sessionId) ?? 600000;
      if (idleTimeoutMs > 0) {
        this.startIdleTimer(sessionId, idleTimeoutMs);
      }

      // Notify of status change
      this.callbacks.onStatusChange(sessionId, "active");

      // Process any queued prompts
      await this.processQueue(sessionId);

    } catch (error) {
      // If wake fails, go back to parked state
      this.setSessionState(sessionId, "parked");
      this.callbacks.onStatusChange(sessionId, "parked");
      
      // Reject all queued prompts
      const queue = this.promptQueues.get(sessionId) ?? [];
      for (const prompt of queue) {
        prompt.reject(error instanceof Error ? error : new Error(String(error)));
      }
      this.promptQueues.delete(sessionId);
      
      throw error;
    }

    return queuePromise;
  }

  private addToQueue(sessionId: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.promptQueues.has(sessionId)) {
        this.promptQueues.set(sessionId, []);
      }
      
      this.promptQueues.get(sessionId)!.push({
        content,
        resolve,
        reject,
      });
    });
  }

  private async processQueue(sessionId: string): Promise<void> {
    const queue = this.promptQueues.get(sessionId) ?? [];
    this.promptQueues.delete(sessionId);

    for (const prompt of queue) {
      try {
        // The actual sending happens elsewhere, we just resolve the promise
        // to indicate the prompt can now be sent
        prompt.resolve();
      } catch (error) {
        prompt.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}
