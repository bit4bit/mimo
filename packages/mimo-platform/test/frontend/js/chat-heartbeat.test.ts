import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// Change: fix-chat-missed-response-recovery
// Capabilities: chat-connection-reliability, streaming-recovery
describe("chat heartbeat & reconnect recovery", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "..", "..", "public", "js", "chat.js"),
    "utf-8",
  );

  describe("heartbeat state and constants", () => {
    it("defines heartbeat interval and missed-pong constants", () => {
      expect(source).toContain("const HEARTBEAT_INTERVAL_MS");
      expect(source).toContain("const MISSED_PONG_LIMIT");
    });

    it("tracks heartbeatInterval and lastPongAt in ChatState", () => {
      expect(source).toContain("heartbeatInterval: null");
      expect(source).toContain("lastPongAt: null");
    });
  });

  describe("onopen starts the heartbeat and reconciles history", () => {
    const onopen = source.match(/onopen = \(\) => \{[\s\S]*?\n  \};/m);

    it("starts a heartbeat on connection open", () => {
      expect(onopen).toBeTruthy();
      expect(onopen![0]).toContain("startHeartbeat()");
    });

    it("resets lastPongAt so a fresh socket is not judged dead", () => {
      expect(onopen).toBeTruthy();
      expect(onopen![0]).toContain("ChatState.lastPongAt = Date.now()");
    });

    it("requests a history replay for the active thread on reconnect", () => {
      expect(onopen).toBeTruthy();
      expect(onopen![0]).toContain('type: "request_replay"');
      expect(onopen![0]).toContain("chatThreadId: activeThreadId");
    });
  });

  describe("startHeartbeat sends ping and detects a dead socket", () => {
    const fn = source.match(/function startHeartbeat[\s\S]*?\n}/m);

    it("clears any prior interval before starting", () => {
      expect(fn).toBeTruthy();
      expect(fn![0]).toContain("stopHeartbeat()");
    });

    it("sends a ping each interval", () => {
      expect(fn).toBeTruthy();
      expect(fn![0]).toContain('type: "ping"');
    });

    it("force-closes the socket when no pong arrives within the limit", () => {
      expect(fn).toBeTruthy();
      expect(fn![0]).toContain("HEARTBEAT_INTERVAL_MS * MISSED_PONG_LIMIT");
      expect(fn![0]).toContain("socket.close()");
    });
  });

  describe("stopHeartbeat clears the interval", () => {
    const fn = source.match(/function stopHeartbeat[\s\S]*?\n}/m);

    it("clears the heartbeat interval and nulls it", () => {
      expect(fn).toBeTruthy();
      expect(fn![0]).toContain("clearInterval(ChatState.heartbeatInterval)");
      expect(fn![0]).toContain("ChatState.heartbeatInterval = null");
    });
  });

  describe("onclose stops the heartbeat before reconnecting", () => {
    const onclose = source.match(/onclose = \(\) => \{[\s\S]*?\n  \};/m);

    it("stops the heartbeat on close", () => {
      expect(onclose).toBeTruthy();
      expect(onclose![0]).toContain("stopHeartbeat()");
    });
  });

  describe("pong updates liveness", () => {
    it("records lastPongAt when a pong is received", () => {
      const pongCase = source.match(
        /case "pong":[\s\S]*?ChatState\.lastPongAt = Date\.now\(\)/m,
      );
      expect(pongCase).toBeTruthy();
    });
  });

  describe("gate recovers on any unrecoverable rejection", () => {
    const fn = source.match(/function shouldAcceptStreamingEvent[\s\S]*?^}/m);

    it("no longer gates recovery on a streaming element being present", () => {
      expect(fn).toBeTruthy();
      // The messageElement precondition on the recovery branch is removed.
      expect(fn![0]).not.toContain("ChatState.streaming.messageElement");
    });

    it("requests a replay when currentPromptId is null", () => {
      expect(fn).toBeTruthy();
      const nullBranch = fn![0].match(
        /if \(!ChatState\.currentPromptId\)[\s\S]*?return false;/m,
      );
      expect(nullBranch).toBeTruthy();
      expect(nullBranch![0]).toContain("requestReplay()");
    });

    it("requests a replay on a mismatch with no usable event promptId", () => {
      expect(fn).toBeTruthy();
      // The final rejection path (mismatch, no adoptable promptId) recovers.
      const tail = fn![0].slice(fn![0].lastIndexOf("requestReplay()"));
      expect(tail).toContain("requestReplay()");
      expect(tail).toContain("return false;");
    });
  });
});
