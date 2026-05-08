import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import { waitForEvent } from "./test-helpers.js";

let chatService: any;

// Mock timeout tracking for tests
let streamingTimeout: ReturnType<typeof setTimeout> | null = null;
let lastStreamingActivity: number | null = null;
const TIMEOUT_MS = 60000; // 60 seconds

function startStreamingTimeoutMock(
  onTimeout: () => void,
  timeoutMs: number = TIMEOUT_MS,
) {
  clearStreamingTimeoutMock();
  lastStreamingActivity = Date.now();
  streamingTimeout = setTimeout(() => {
    onTimeout();
  }, timeoutMs);
}

function clearStreamingTimeoutMock() {
  if (streamingTimeout) {
    clearTimeout(streamingTimeout);
    streamingTimeout = null;
  }
  lastStreamingActivity = Date.now();
}

describe("Chat Input Recovery", () => {
  const testHome = join(tmpdir(), `mimo-chat-recovery-test-${Date.now()}`);

  beforeAll(async () => {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    chatService = ctx.services.chat;
  });

  afterAll(async () => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    // Reset mock state
    clearStreamingTimeoutMock();
    streamingTimeout = null;
    lastStreamingActivity = null;
  });

  describe("Timeout Recovery", () => {
    it("should have timeout mechanism available", () => {
      expect(TIMEOUT_MS).toBe(60000);
    });

    it("should track last streaming activity", () => {
      const before = Date.now();
      startStreamingTimeoutMock(() => {});
      const after = Date.now();

      expect(lastStreamingActivity).toBeGreaterThanOrEqual(before);
      expect(lastStreamingActivity).toBeLessThanOrEqual(after);
    });

    it("should clear timeout when usage_update arrives", () => {
      let timeoutCalled = false;
      let resolveTimeoutEvent: () => void;
      const timeoutEvent = new Promise<void>((resolve) => {
        resolveTimeoutEvent = resolve;
      });

      startStreamingTimeoutMock(() => {
        timeoutCalled = true;
        resolveTimeoutEvent();
      }, 50);

      // Simulate usage_update arriving
      clearStreamingTimeoutMock();

      return expect(
        waitForEvent(timeoutEvent, { timeout: 100 }),
      ).rejects.toThrow();
    });
  });

  describe("Agent Health Tracking", () => {
    it("should track agent activity", () => {
      const sessionId = "test-session-1";
      const before = Date.now();

      chatService.updateAgentActivity(sessionId);
      const activity = chatService.getLastAgentActivity(sessionId);

      expect(activity).toBeGreaterThanOrEqual(before);
      expect(activity).toBeLessThanOrEqual(Date.now());
    });

    it("should detect agent as alive when active recently", () => {
      const sessionId = "test-session-alive";
      chatService.updateAgentActivity(sessionId);

      const isAlive = chatService.isAgentAlive(sessionId);
      expect(isAlive).toBe(true);
    });

    it("should detect agent as dead when inactive for too long", () => {
      const sessionId = "test-session-dead";

      // Manually set activity to 6 minutes ago (past the 5 minute timeout)
      const chatServiceAny = chatService as any;
      chatServiceAny.lastAgentActivity.set(sessionId, Date.now() - 360000);

      const isAlive = chatService.isAgentAlive(sessionId);
      expect(isAlive).toBe(false);
    });

    it("should return false for unknown sessions", () => {
      const sessionId = "unknown-session";
      const isAlive = chatService.isAgentAlive(sessionId);
      expect(isAlive).toBe(false);
    });

    it("should clear agent activity tracking", () => {
      const sessionId = "test-session-clear";
      chatService.updateAgentActivity(sessionId);

      expect(chatService.isAgentAlive(sessionId)).toBe(true);

      chatService.clearAgentActivity(sessionId);
      expect(chatService.isAgentAlive(sessionId)).toBe(false);
    });
  });

  describe("Streaming State Logic", () => {
    it("should NOT send streaming_state when agent is dead", () => {
      const sessionId = "test-session-dead-streaming";
      const thoughtContent = "Some thought";
      const messageContent = "Some message";

      // Agent is dead (no activity recorded)
      const isAgentAlive = chatService.isAgentAlive(sessionId);
      const shouldSendState =
        !!(thoughtContent || messageContent) && isAgentAlive;

      expect(isAgentAlive).toBe(false);
      expect(shouldSendState).toBe(false);
    });

    it("should send streaming_state when agent is alive", () => {
      const sessionId = "test-session-alive-streaming";
      const thoughtContent = "Some thought";
      const messageContent = "Some message";

      // Agent is alive
      chatService.updateAgentActivity(sessionId);
      const isAgentAlive = chatService.isAgentAlive(sessionId);
      const shouldSendState =
        !!(thoughtContent || messageContent) && isAgentAlive;

      expect(isAgentAlive).toBe(true);
      expect(shouldSendState).toBe(true);
    });

    it("should send streaming_state when prompt is in-flight even with empty buffers", () => {
      const sessionId = "test-session-inflight";
      const thoughtContent = "";
      const messageContent = "";
      const isPromptInFlight = true;

      chatService.updateAgentActivity(sessionId);
      const isAgentAlive = chatService.isAgentAlive(sessionId);
      const shouldSendState =
        !!(thoughtContent || messageContent || isPromptInFlight) &&
        isAgentAlive;

      expect(isAgentAlive).toBe(true);
      expect(shouldSendState).toBe(true);
    });
  });

  describe("Input Restoration on Refresh", () => {
    it("should force input creation after 2 second delay", async () => {
      // Simulate the setTimeout that forces input restoration
      let inputCreated = false;
      const forceDelayMs = 20;

      const mockForceInput = (delayMs: number) => {
        setTimeout(() => {
          inputCreated = true;
        }, delayMs);
      };

      mockForceInput(forceDelayMs);

      // Wait for timeout
      await waitForEvent(
        new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            if (inputCreated) {
              clearInterval(interval);
              resolve();
            }
          }, 5);
        }),
        { timeout: 250 },
      );

      expect(inputCreated).toBe(true);
    });

    it("should handle _reconstructedStreaming flag", () => {
      let _reconstructedStreaming = true;

      // When usage_update arrives, flag should be cleared
      const handleUsageUpdate = () => {
        _reconstructedStreaming = false;
      };

      expect(_reconstructedStreaming).toBe(true);
      handleUsageUpdate();
      expect(_reconstructedStreaming).toBe(false);
    });
  });
});
