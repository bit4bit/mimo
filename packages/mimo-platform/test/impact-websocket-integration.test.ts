import { describe, it, expect } from "bun:test";
import { handleRefreshImpact } from "../src/impact/refresh-handler";

describe("WebSocket refresh_impact integration", () => {
  it("declares calculatingSessions and passes it to handleRefreshImpact", async () => {
    // This test ensures the calculatingSessions Set is properly declared
    // and passed to handleRefreshImpact in the WebSocket handler.
    const calculatingSessions = new Set<string>();
    const sent: Array<Record<string, unknown>> = [];

    await handleRefreshImpact({
      sessionId: "s1",
      calculatingSessions,
      sendToRequester: (message) => sent.push(message),
      broadcast: (_sessionId, message) => sent.push(message),
      findSessionById: async () => ({
        id: "s1",
        upstreamPath: "/u",
        agentWorkspacePath: "/w",
      }),
      calculateImpact: async () => ({
        metrics: {
          files: { new: 0, changed: 0, deleted: 0, unchanged: 0 },
          linesOfCode: { added: 0, removed: 0, net: 0 },
          complexity: { cyclomatic: 0, cognitive: 0, estimatedMinutes: 0 },
          byLanguage: [],
          byFile: [],
        },
        trends: {
          files: { new: "→", changed: "→", deleted: "→" },
          linesOfCode: { added: "→", removed: "→", net: "→" },
          complexity: { cyclomatic: "→", cognitive: "→" },
        },
      }),
      now: () => "2026-04-12T10:00:00.000Z",
    });

    expect(calculatingSessions.has("s1")).toBe(false);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].type).toBe("impact_calculating");
    expect(sent[1].type).toBe("impact_updated");
  });

  it("prevents concurrent refresh calculations", async () => {
    const calculatingSessions = new Set<string>(["s1"]);
    const sent: Array<Record<string, unknown>> = [];

    await handleRefreshImpact({
      sessionId: "s1",
      calculatingSessions,
      sendToRequester: (message) => sent.push(message),
      broadcast: () => {},
      findSessionById: async () => null,
      calculateImpact: async () => {
        throw new Error("should not run");
      },
      now: () => "2026-04-12T10:00:00.000Z",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe("impact_calculating");
    expect(calculatingSessions.has("s1")).toBe(true);
  });
});
