// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Failing integration tests for: add-chat-threads-shared-workspace
 *
 * Tasks covered:
 *   1.1  create chat thread spawns dedicated ACP runtime in shared checkout
 *   1.6  activity on one thread prevents other threads from being parked
 *   1.7  session-level idle timeout parks all threads at once
 *   1.8  incoming prompt wakes only the targeted thread, others remain parked
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SessionLifecycleManager } from "../src/lifecycle.js";
import type { SessionLifecycleCallbacks } from "../src/lifecycle.js";

function makeCallbacks(
  overrides: Partial<SessionLifecycleCallbacks> = {},
): SessionLifecycleCallbacks {
  return {
    onStatusChange: overrides.onStatusChange ?? (() => {}),
    onCacheState: overrides.onCacheState ?? (() => {}),
    onGetCachedState: overrides.onGetCachedState ?? (() => undefined),
    onSpawnAcp: overrides.onSpawnAcp ?? (async () => null),
    onTerminateThread: overrides.onTerminateThread ?? (async () => {}),
  };
}

describe("Thread-aware SessionLifecycleManager", () => {
  // Task 1.1 — thread-aware runtime tracking
  describe("Thread runtime initialization", () => {
    it("tracks runtimes by composite key {sessionId, chatThreadId}", () => {
      const manager = new SessionLifecycleManager(makeCallbacks());
      const sessionId = "sess-1";

      manager.initializeThread(sessionId, "thread-main", 600000);
      manager.initializeThread(sessionId, "thread-review", 600000);

      expect(manager.getThreadState(sessionId, "thread-main")).toBe("active");
      expect(manager.getThreadState(sessionId, "thread-review")).toBe("active");
    });

    it("two threads in the same session are independently tracked", () => {
      const manager = new SessionLifecycleManager(makeCallbacks());
      const sessionId = "sess-1";

      manager.initializeThread(sessionId, "t1", 600000);
      manager.initializeThread(sessionId, "t2", 600000);

      // Both start active
      expect(manager.getThreadState(sessionId, "t1")).toBe("active");
      expect(manager.getThreadState(sessionId, "t2")).toBe("active");
    });
  });

  // Task 1.6 — session-level idle timer reset by any thread activity
  describe("Session-level idle timer", () => {
    it("activity on one thread resets the shared session idle timer", async () => {
      const parkedThreads: string[] = [];

      const manager = new SessionLifecycleManager(
        makeCallbacks({
          onStatusChange: (_sessionId, chatThreadId, status) => {
            if (status === "parked") parkedThreads.push(chatThreadId as string);
          },
          onTerminateThread: async () => {},
        }),
      );

      const sessionId = "sess-act";

      // Initialize two threads with a very short idle timeout
      manager.initializeThread(sessionId, "t1", 80);
      manager.initializeThread(sessionId, "t2", 80);

      // Activity on t1 should reset the timer so neither thread parks within 60ms
      await new Promise((r) => setTimeout(r, 40));
      manager.recordActivity(sessionId, "t1");

      // Wait another 60ms — timer was reset so neither should have parked yet
      await new Promise((r) => setTimeout(r, 60));

      expect(parkedThreads).toHaveLength(0);

      // Now wait for the full timeout to fire (80ms from last activity = ~80ms more)
      await new Promise((r) => setTimeout(r, 100));

      // After inactivity, both threads should be parked
      expect(parkedThreads).toContain("t1");
      expect(parkedThreads).toContain("t2");
    });
  });

  // Task 1.7 — session idle timeout parks ALL threads
  describe("Session idle timeout", () => {
    it("parks all active thread runtimes when the session idle timer fires", async () => {
      const parkedThreads: string[] = [];

      const manager = new SessionLifecycleManager(
        makeCallbacks({
          onStatusChange: (_sessionId, chatThreadId, status) => {
            if (status === "parked") parkedThreads.push(chatThreadId as string);
          },
          onTerminateThread: async () => {},
        }),
      );

      const sessionId = "sess-idle";
      manager.initializeThread(sessionId, "thread-a", 50);
      manager.initializeThread(sessionId, "thread-b", 50);
      manager.initializeThread(sessionId, "thread-c", 50);

      // Wait for idle timeout to fire
      await new Promise((r) => setTimeout(r, 150));

      expect(parkedThreads).toContain("thread-a");
      expect(parkedThreads).toContain("thread-b");
      expect(parkedThreads).toContain("thread-c");
      expect(manager.getThreadState(sessionId, "thread-a")).toBe("parked");
      expect(manager.getThreadState(sessionId, "thread-b")).toBe("parked");
      expect(manager.getThreadState(sessionId, "thread-c")).toBe("parked");
    });
  });

  // Task 1.8 — incoming prompt wakes only targeted thread
  describe("Selective thread wake on incoming prompt", () => {
    it("wakes only the targeted parked thread, leaves sibling threads parked", async () => {
      const statusChanges: Array<{ threadId: string; status: string }> = [];
      let spawnCallThreadIds: string[] = [];

      const manager = new SessionLifecycleManager(
        makeCallbacks({
          onStatusChange: (_sessionId, chatThreadId, status) => {
            statusChanges.push({ threadId: chatThreadId as string, status });
          },
          onSpawnAcp: async (_sessionId, chatThreadId, _cachedState) => {
            spawnCallThreadIds.push(chatThreadId as string);
            return {} as any; // simulate successful ACP client
          },
          onTerminateThread: async () => {},
        }),
      );

      const sessionId = "sess-wake";
      manager.initializeThread(sessionId, "t1", 50);
      manager.initializeThread(sessionId, "t2", 50);

      // Let both threads park
      await new Promise((r) => setTimeout(r, 150));

      expect(manager.getThreadState(sessionId, "t1")).toBe("parked");
      expect(manager.getThreadState(sessionId, "t2")).toBe("parked");

      spawnCallThreadIds = [];
      statusChanges.length = 0;

      // Send prompt to t2 only
      const queuePromise = manager.queueThreadPrompt(sessionId, "t2", "hello");
      await new Promise((r) => setTimeout(r, 50));

      // Only t2 should have been spawned
      expect(spawnCallThreadIds).toContain("t2");
      expect(spawnCallThreadIds).not.toContain("t1");

      // t1 must still be parked
      expect(manager.getThreadState(sessionId, "t1")).toBe("parked");

      // t2 transitions to waking then active
      const t2Statuses = statusChanges
        .filter((c) => c.threadId === "t2")
        .map((c) => c.status);
      expect(t2Statuses).toContain("waking");
    });
  });
});
