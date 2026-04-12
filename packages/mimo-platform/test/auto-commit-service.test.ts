import { describe, it, expect } from "bun:test";
import { AutoCommitService } from "../src/auto-commit/service";

describe("AutoCommitService", () => {
  it("triggers commit with generated message when changes exist", async () => {
    const commitMessages: string[] = [];
    const statuses: Array<Record<string, unknown>> = [];

    const service = new AutoCommitService({
      commitService: {
        commitAndPush: async (_sessionId: string, message?: string) => {
          if (message) {
            commitMessages.push(message);
          }
          return { success: true, message: "ok", step: null };
        },
      },
      sessionRepository: {
        findById: async () => ({
          id: "s1",
          name: "AuthSession",
          upstreamPath: "/tmp/upstream",
          agentWorkspacePath: "/tmp/work",
        }),
        update: async (_sessionId: string, update: Record<string, unknown>) => {
          statuses.push(update);
          return null;
        },
      },
      impactCalculator: {
        calculateImpact: async () => ({
          metrics: {
            files: { new: 1, changed: 2, deleted: 0, unchanged: 0 },
            linesOfCode: { added: 10, removed: 4, net: 6 },
          },
          trends: {},
        }),
      },
    });

    const result = await service.handleThoughtEnd("s1");

    expect(result.success).toBe(true);
    expect(commitMessages).toHaveLength(1);
    expect(commitMessages[0]).toBe("[AuthSession] - 3 files changed (+10/-4 lines)");
    expect(statuses.some((s) => s.syncState === "syncing")).toBe(true);
    expect(statuses.some((s) => s.syncState === "idle")).toBe(true);
  });

  it("skips commit when no changes exist", async () => {
    let commitCalled = false;

    const service = new AutoCommitService({
      commitService: {
        commitAndPush: async () => {
          commitCalled = true;
          return { success: true, message: "ok", step: null };
        },
      },
      sessionRepository: {
        findById: async () => ({
          id: "s1",
          name: "NoChanges",
          upstreamPath: "/tmp/upstream",
          agentWorkspacePath: "/tmp/work",
        }),
        update: async () => null,
      },
      impactCalculator: {
        calculateImpact: async () => ({
          metrics: {
            files: { new: 0, changed: 0, deleted: 0, unchanged: 4 },
            linesOfCode: { added: 0, removed: 0, net: 0 },
          },
          trends: {},
        }),
      },
    });

    const result = await service.handleThoughtEnd("s1");
    expect(result.success).toBe(true);
    expect(result.message).toContain("No changes");
    expect(commitCalled).toBe(false);
  });
});
