/**
 * Tests for: persistent-terminals
 *
 * Tasks covered:
 *   2.1  terminal activity resets the session idle timer (recordActivity path)
 *   3.1  parking is skipped while a live terminal process exists for the session
 */
import { describe, it, expect, mock } from "bun:test";
import { SessionLifecycleManager } from "../src/lifecycle.js";
import type { SessionLifecycleCallbacks } from "../src/lifecycle.js";
import { waitFor } from "./test-helpers";

function makeCallbacks(
  overrides: Partial<SessionLifecycleCallbacks> = {},
): SessionLifecycleCallbacks {
  return {
    onStatusChange: overrides.onStatusChange ?? (() => {}),
    onCacheState: overrides.onCacheState ?? (() => {}),
    onGetCachedState: overrides.onGetCachedState ?? (() => undefined),
    onSpawnAcp: overrides.onSpawnAcp ?? (async () => null),
    onTerminateThread: overrides.onTerminateThread ?? (async () => {}),
    ...(overrides.hasLiveTerminals !== undefined
      ? { hasLiveTerminals: overrides.hasLiveTerminals }
      : {}),
  };
}

describe("persistent-terminals: idle veto for live terminals", () => {
  it("skips parking while a live terminal exists, then parks once terminals are gone", async () => {
    const parkedThreads: string[] = [];
    let liveTerminals = true;

    const manager = new SessionLifecycleManager(
      makeCallbacks({
        onStatusChange: (_sessionId, chatThreadId, status) => {
          if (status === "parked") parkedThreads.push(chatThreadId as string);
        },
        hasLiveTerminals: () => liveTerminals,
      }),
    );

    const sessionId = "sess-term";

    manager.initializeThread(sessionId, "t1", 60);

    // Wait well past the idle timeout — parking must have been vetoed
    await waitFor(() => parkedThreads.length > 0, {
      timeout: 200,
      interval: 20,
    }).catch(() => {});
    expect(parkedThreads).toEqual([]);
    expect(manager.getThreadState(sessionId, "t1")).toBe("active");

    // Terminal exits — next timer fire parks as usual
    liveTerminals = false;
    await waitFor(() => parkedThreads.length > 0, {
      timeout: 500,
      interval: 20,
    });
    expect(parkedThreads).toEqual(["t1"]);
    expect(manager.getThreadState(sessionId, "t1")).toBe("parked");
  });

  it("parks normally when no hasLiveTerminals callback is provided", async () => {
    const parkedThreads: string[] = [];

    const manager = new SessionLifecycleManager(
      makeCallbacks({
        onStatusChange: (_sessionId, chatThreadId, status) => {
          if (status === "parked") parkedThreads.push(chatThreadId as string);
        },
      }),
    );

    manager.initializeThread("sess-plain", "t1", 60);

    await waitFor(() => parkedThreads.length > 0, {
      timeout: 500,
      interval: 20,
    });
    expect(parkedThreads).toEqual(["t1"]);
  });

  it("recordActivity (terminal I/O path) resets the session idle timer", async () => {
    const parkedThreads: string[] = [];

    const manager = new SessionLifecycleManager(
      makeCallbacks({
        onStatusChange: (_sessionId, chatThreadId, status) => {
          if (status === "parked") parkedThreads.push(chatThreadId as string);
        },
      }),
    );

    const sessionId = "sess-io";
    manager.initializeThread(sessionId, "t1", 100);

    // Simulate periodic terminal I/O keeping the session alive
    for (let i = 0; i < 4; i++) {
      await waitFor(() => false, { timeout: 70, interval: 70 }).catch(
        () => {},
      );
      manager.recordActivity(sessionId);
    }

    expect(parkedThreads).toEqual([]);

    // After activity stops, the timer fires
    await waitFor(() => parkedThreads.length > 0, {
      timeout: 500,
      interval: 20,
    });
    expect(parkedThreads).toEqual(["t1"]);
  });
});
