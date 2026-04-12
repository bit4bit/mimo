import { describe, it, expect } from "bun:test";
import { broadcastToSession } from "../src/ws/session-broadcast";

describe("session broadcast", () => {
  it("sends a message to every connected client in a session", () => {
    const sentA: string[] = [];
    const sentB: string[] = [];

    const clientA = { readyState: 1, send: (message: string) => sentA.push(message) };
    const clientB = { readyState: 1, send: (message: string) => sentB.push(message) };

    const chatSessions = new Map<string, Set<{ readyState: number; send: (message: string) => void }>>();
    chatSessions.set("s1", new Set([clientA, clientB]));

    broadcastToSession(chatSessions, "s1", { type: "impact_updated", sessionId: "s1" });

    expect(sentA).toHaveLength(1);
    expect(sentB).toHaveLength(1);
    expect(JSON.parse(sentA[0]).type).toBe("impact_updated");
    expect(JSON.parse(sentB[0]).sessionId).toBe("s1");
  });
});
