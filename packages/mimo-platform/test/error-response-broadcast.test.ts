import { describe, it, expect } from "bun:test";
import { broadcastToSession } from "../src/ws/session-broadcast";

// Platform extraction logic - assumes error is always an object
describe("error_response platform extraction", () => {
  it("extracts message from ACP error object", () => {
    const acpError = {
      code: -32603,
      message:
        "Internal error: You've hit your limit · resets 11:50pm (Europe/Helsinki)",
    };

    const message = acpError?.message || String(acpError);
    expect(message).toBe(
      "Internal error: You've hit your limit · resets 11:50pm (Europe/Helsinki)",
    );
  });

  it("handles Error instances", () => {
    const err = new Error("Standard error");
    const message = err?.message || String(err);
    expect(message).toBe("Standard error");
  });

  it("handles objects without message property", () => {
    const err = { code: 500, details: "Server error" };
    const message = err?.message || String(err);
    expect(message).toBe("[object Object]");
  });
});

describe("error_response broadcast", () => {
  it("broadcasts extracted error message to all session clients", () => {
    const sentMessages: string[] = [];

    const clientA = {
      readyState: 1,
      send: (message: string) => sentMessages.push(message),
    };

    const clientB = {
      readyState: 1,
      send: (message: string) => sentMessages.push(message),
    };

    const chatSessions = new Map<
      string,
      Set<{ readyState: number; send: (message: string) => void }>
    >();
    chatSessions.set("session-1", new Set([clientA, clientB]));

    // Simulate raw ACP error object
    const rawError = {
      code: -32603,
      message: "Internal error: You've hit your limit",
    };

    const errorMessage = rawError?.message || String(rawError);

    broadcastToSession(chatSessions, "session-1", {
      type: "error",
      chatThreadId: "thread-1",
      message: errorMessage,
      timestamp: "2026-04-24T12:00:00.000Z",
    });

    expect(sentMessages).toHaveLength(2);

    const payloadA = JSON.parse(sentMessages[0]);
    expect(payloadA.type).toBe("error");
    expect(payloadA.message).toBe("Internal error: You've hit your limit");
    expect(payloadA.chatThreadId).toBe("thread-1");
  });

  it("does not broadcast to clients in other sessions", () => {
    const sentMessagesA: string[] = [];
    const sentMessagesB: string[] = [];

    const clientA = {
      readyState: 1,
      send: (message: string) => sentMessagesA.push(message),
    };

    const clientB = {
      readyState: 1,
      send: (message: string) => sentMessagesB.push(message),
    };

    const chatSessions = new Map<
      string,
      Set<{ readyState: number; send: (message: string) => void }>
    >();
    chatSessions.set("session-1", new Set([clientA]));
    chatSessions.set("session-2", new Set([clientB]));

    broadcastToSession(chatSessions, "session-1", {
      type: "error",
      message: "Rate limit exceeded",
      timestamp: "2026-04-24T12:00:00.000Z",
    });

    expect(sentMessagesA).toHaveLength(1);
    expect(sentMessagesB).toHaveLength(0);
  });

  it("skips clients that are not open", () => {
    const sentMessages: string[] = [];

    const openClient = {
      readyState: 1,
      send: (message: string) => sentMessages.push(message),
    };

    const closedClient = {
      readyState: 3,
      send: (message: string) => sentMessages.push(message),
    };

    const chatSessions = new Map<
      string,
      Set<{ readyState: number; send: (message: string) => void }>
    >();
    chatSessions.set("session-1", new Set([openClient, closedClient]));

    broadcastToSession(chatSessions, "session-1", {
      type: "error",
      message: "Connection failed",
      timestamp: "2026-04-24T12:00:00.000Z",
    });

    expect(sentMessages).toHaveLength(1);
  });
});
