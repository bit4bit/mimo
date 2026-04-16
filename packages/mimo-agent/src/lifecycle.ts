import { AcpClient } from "./acp/index.js";
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
  /** Called when a thread's ACP state changes. */
  onStatusChange: (
    sessionId: string,
    chatThreadId: string,
    status: AcpSessionState,
  ) => void;
  onCacheState: (
    sessionId: string,
    chatThreadId: string,
    state: CachedAcpState,
  ) => void;
  onGetCachedState: (
    sessionId: string,
    chatThreadId: string,
  ) => CachedAcpState | undefined;
  onSpawnAcp: (
    sessionId: string,
    chatThreadId: string,
    cachedState?: CachedAcpState,
  ) => Promise<AcpClient | null>;
  /** Terminate the ACP process for a specific thread. */
  onTerminateThread: (
    sessionId: string,
    chatThreadId: string,
  ) => Promise<void>;
}

// Composite key helpers
function threadKey(sessionId: string, chatThreadId: string): string {
  return `${sessionId}:${chatThreadId}`;
}

/**
 * Thread-aware session lifecycle manager.
 *
 * - One idle timer per session (shared across all threads).
 * - Activity on any thread resets the session-level timer.
 * - When the session timer fires, ALL active threads are parked.
 * - On an incoming prompt for a parked thread, only THAT thread wakes;
 *   other parked threads remain parked.
 */
export class SessionLifecycleManager {
  // keyed by threadKey(sessionId, chatThreadId)
  private threadStates: Map<string, AcpSessionState> = new Map();
  private promptQueues: Map<string, QueuedPrompt[]> = new Map();

  // keyed by sessionId
  private sessionThreads: Map<string, Set<string>> = new Map();
  private sessionIdleTimers: Map<string, NodeJS.Timeout> = new Map();
  private sessionIdleTimeouts: Map<string, number> = new Map();

  private callbacks: SessionLifecycleCallbacks;

  constructor(callbacks: SessionLifecycleCallbacks) {
    this.callbacks = callbacks;
  }

  // ---------------------------------------------------------------------------
  // Thread lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Register a thread and start (or reset) the session-level idle timer.
   * Must be called before any other per-thread operation.
   */
  initializeThread(
    sessionId: string,
    chatThreadId: string,
    idleTimeoutMs: number,
  ): void {
    const key = threadKey(sessionId, chatThreadId);
    this.threadStates.set(key, "active");

    // Track which threads belong to this session
    if (!this.sessionThreads.has(sessionId)) {
      this.sessionThreads.set(sessionId, new Set());
    }
    this.sessionThreads.get(sessionId)!.add(chatThreadId);

    // Update/start session-level idle timer
    this.sessionIdleTimeouts.set(sessionId, idleTimeoutMs);
    if (idleTimeoutMs > 0) {
      this.startSessionIdleTimer(sessionId, idleTimeoutMs);
    }
  }

  /** Get the current state of a specific thread. */
  getThreadState(sessionId: string, chatThreadId: string): AcpSessionState {
    return this.threadStates.get(threadKey(sessionId, chatThreadId)) ?? "active";
  }

  /**
   * Record activity for a session (any thread).
   * Resets the shared session-level idle timer.
   */
  recordActivity(sessionId: string, chatThreadId?: string): void {
    const idleTimeoutMs =
      this.sessionIdleTimeouts.get(sessionId) ?? 600000;
    if (idleTimeoutMs > 0) {
      this.startSessionIdleTimer(sessionId, idleTimeoutMs);
    }
  }

  /**
   * Queue a prompt for a specific thread.
   * - active  → record activity and resolve immediately
   * - parked  → wake only this thread, queue the prompt
   * - waking  → add to queue
   */
  async queueThreadPrompt(
    sessionId: string,
    chatThreadId: string,
    content: string,
  ): Promise<void> {
    const state = this.getThreadState(sessionId, chatThreadId);

    if (state === "active") {
      this.recordActivity(sessionId, chatThreadId);
      return;
    }

    if (state === "parked") {
      return this.wakeThreadAndQueuePrompt(sessionId, chatThreadId, content);
    }

    if (state === "waking") {
      return this.addToQueue(sessionId, chatThreadId, content);
    }

    return Promise.reject(new Error(`Unknown thread state: ${state}`));
  }

  /** Clean up a single thread. */
  endThread(sessionId: string, chatThreadId: string): void {
    const key = threadKey(sessionId, chatThreadId);

    // Reject queued prompts
    const queue = this.promptQueues.get(key);
    if (queue) {
      for (const p of queue) p.reject(new Error("Thread ended"));
      this.promptQueues.delete(key);
    }

    this.threadStates.delete(key);

    const threads = this.sessionThreads.get(sessionId);
    if (threads) {
      threads.delete(chatThreadId);
      if (threads.size === 0) {
        this.endSession(sessionId);
      }
    }
  }

  /** Clean up all threads for a session and cancel the idle timer. */
  endSession(sessionId: string): void {
    const timer = this.sessionIdleTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.sessionIdleTimers.delete(sessionId);
    }

    const threads = this.sessionThreads.get(sessionId) ?? new Set();
    for (const chatThreadId of threads) {
      const key = threadKey(sessionId, chatThreadId);
      const queue = this.promptQueues.get(key);
      if (queue) {
        for (const p of queue) p.reject(new Error("Session ended"));
        this.promptQueues.delete(key);
      }
      this.threadStates.delete(key);
    }

    this.sessionThreads.delete(sessionId);
    this.sessionIdleTimeouts.delete(sessionId);
  }

  /** Update idle timeout for a session and restart the timer. */
  updateIdleTimeout(sessionId: string, idleTimeoutMs: number): void {
    this.sessionIdleTimeouts.set(sessionId, idleTimeoutMs);

    const existing = this.sessionIdleTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.sessionIdleTimers.delete(sessionId);
    }

    if (idleTimeoutMs > 0) {
      this.startSessionIdleTimer(sessionId, idleTimeoutMs);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private startSessionIdleTimer(
    sessionId: string,
    idleTimeoutMs: number,
  ): void {
    const existing = this.sessionIdleTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.parkAllSessionThreads(sessionId);
    }, idleTimeoutMs);

    this.sessionIdleTimers.set(sessionId, timer);
  }

  private async parkAllSessionThreads(sessionId: string): Promise<void> {
    const threads = this.sessionThreads.get(sessionId);
    if (!threads) return;

    for (const chatThreadId of threads) {
      const state = this.getThreadState(sessionId, chatThreadId);
      if (state !== "active") continue;

      this.setThreadState(sessionId, chatThreadId, "parked");

      // Cache state then terminate ACP for this thread
      await this.callbacks.onTerminateThread(sessionId, chatThreadId);

      this.callbacks.onStatusChange(sessionId, chatThreadId, "parked");
    }
  }

  private setThreadState(
    sessionId: string,
    chatThreadId: string,
    state: AcpSessionState,
  ): void {
    this.threadStates.set(threadKey(sessionId, chatThreadId), state);
  }

  private async wakeThreadAndQueuePrompt(
    sessionId: string,
    chatThreadId: string,
    content: string,
  ): Promise<void> {
    this.setThreadState(sessionId, chatThreadId, "waking");
    this.callbacks.onStatusChange(sessionId, chatThreadId, "waking");

    // Queue the prompt before waking so it's processed after ACP is ready
    const queuePromise = this.addToQueue(sessionId, chatThreadId, content);

    try {
      const cachedState = this.callbacks.onGetCachedState(sessionId, chatThreadId);
      const acpClient = await this.callbacks.onSpawnAcp(
        sessionId,
        chatThreadId,
        cachedState,
      );

      if (!acpClient) throw new Error("Failed to spawn ACP process");

      this.setThreadState(sessionId, chatThreadId, "active");

      // Restart the session-level idle timer now that a thread is active
      const idleTimeoutMs = this.sessionIdleTimeouts.get(sessionId) ?? 600000;
      if (idleTimeoutMs > 0) {
        this.startSessionIdleTimer(sessionId, idleTimeoutMs);
      }

      this.callbacks.onStatusChange(sessionId, chatThreadId, "active");

      await this.processQueue(sessionId, chatThreadId);
    } catch (error) {
      this.setThreadState(sessionId, chatThreadId, "parked");
      this.callbacks.onStatusChange(sessionId, chatThreadId, "parked");

      const key = threadKey(sessionId, chatThreadId);
      const queue = this.promptQueues.get(key) ?? [];
      for (const p of queue) {
        p.reject(error instanceof Error ? error : new Error(String(error)));
      }
      this.promptQueues.delete(key);
      throw error;
    }

    return queuePromise;
  }

  private addToQueue(
    sessionId: string,
    chatThreadId: string,
    content: string,
  ): Promise<void> {
    const key = threadKey(sessionId, chatThreadId);
    return new Promise((resolve, reject) => {
      if (!this.promptQueues.has(key)) {
        this.promptQueues.set(key, []);
      }
      this.promptQueues.get(key)!.push({ content, resolve, reject });
    });
  }

  private async processQueue(
    sessionId: string,
    chatThreadId: string,
  ): Promise<void> {
    const key = threadKey(sessionId, chatThreadId);
    const queue = this.promptQueues.get(key) ?? [];
    this.promptQueues.delete(key);
    for (const p of queue) {
      try {
        p.resolve();
      } catch (error) {
        p.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}
