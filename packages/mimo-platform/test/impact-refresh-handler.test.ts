// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";
import { handleRefreshImpact } from "../src/impact/refresh-handler";

describe("impact refresh handler", () => {
  it("runs a full refresh flow and broadcasts state transitions", async () => {
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
          files: { new: 1, changed: 2, deleted: 0, unchanged: 3 },
          linesOfCode: { added: 10, removed: 1, net: 9 },
          complexity: { cyclomatic: 4, cognitive: 2, estimatedMinutes: 1 },
          byLanguage: [],
          byFile: [],
        },
        trends: {
          files: { new: "↑", changed: "→", deleted: "→" },
          linesOfCode: { added: "↑", removed: "→", net: "↑" },
          complexity: { cyclomatic: "↑", cognitive: "→" },
        },
      }),
      now: () => "2026-04-12T10:00:00.000Z",
    });

    expect(sent[0].type).toBe("impact_calculating");
    expect(sent[1].type).toBe("impact_updated");
    expect(sent[1].stale).toBe(false);
    expect(calculatingSessions.has("s1")).toBe(false);
  });

  it("rejects duplicate refresh while one is already running", async () => {
    const calculatingSessions = new Set<string>(["s1"]);
    const requester: Array<Record<string, unknown>> = [];

    await handleRefreshImpact({
      sessionId: "s1",
      calculatingSessions,
      sendToRequester: (message) => requester.push(message),
      broadcast: () => {},
      findSessionById: async () => null,
      calculateImpact: async () => {
        throw new Error("should not run");
      },
      now: () => "2026-04-12T10:00:00.000Z",
    });

    expect(requester).toHaveLength(1);
    expect(requester[0].type).toBe("impact_calculating");
  });

  it("broadcasts impact_error when SCC execution fails", async () => {
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
      calculateImpact: async () => {
        throw new Error("scc failed");
      },
      now: () => "2026-04-12T10:00:00.000Z",
    });

    expect(sent[0].type).toBe("impact_calculating");
    expect(sent[1].type).toBe("impact_error");
    expect(sent[1].error).toBe("scc failed");
    expect(calculatingSessions.has("s1")).toBe(false);
  });
});
