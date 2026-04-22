// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";
import { AutoCommitService } from "../src/auto-commit/service";

function makeService(overrides: {
  duplication?: {
    percentage: number;
    duplicatedLines: number;
    clones: unknown[];
  };
  blockThreshold?: number;
  warningThreshold?: number;
  onCommit?: (msg: string) => void;
}) {
  const commitMessages: string[] = [];
  const service = new AutoCommitService({
    duplicationBlockThreshold: overrides.blockThreshold ?? 30,
    duplicationWarningThreshold: overrides.warningThreshold ?? 15,
    commitService: {
      commitAndPush: async (_sessionId: string, message?: string) => {
        if (message) {
          commitMessages.push(message);
          overrides.onCommit?.(message);
        }
        return { success: true, message: "ok", step: null };
      },
    },
    sessionRepository: {
      findById: async () => ({
        id: "s1",
        name: "DupSession",
        upstreamPath: "/tmp/upstream",
        agentWorkspacePath: "/tmp/work",
      }),
      update: async () => null,
    },
    impactCalculator: {
      calculateImpact: async () => ({
        metrics: {
          files: { new: 1, changed: 0, deleted: 0, unchanged: 0 },
          linesOfCode: { added: 20, removed: 0, net: 20 },
          duplication: overrides.duplication ?? {
            percentage: 0,
            duplicatedLines: 0,
            clones: [],
          },
        },
        trends: {},
      }),
    },
  });
  return { service, commitMessages };
}

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
    expect(commitMessages[0]).toBe(
      "[AuthSession] - 3 files changed (+10/-4 lines)",
    );
    expect(statuses.some((s) => s.syncState === "syncing")).toBe(true);
    expect(statuses.some((s) => s.syncState === "idle")).toBe(true);
  });

  it("blocks commit when duplication exceeds blockThreshold", async () => {
    const { service } = makeService({
      duplication: { percentage: 35, duplicatedLines: 7, clones: [{}] },
    });

    const result = await service.handleThoughtEnd("s1");

    expect(result.success).toBe(false);
    expect(result.message).toContain("duplication");
  });

  it("appends duplication warning to commit message when above warningThreshold", async () => {
    const { service, commitMessages } = makeService({
      duplication: { percentage: 20, duplicatedLines: 4, clones: [{}] },
    });

    const result = await service.handleThoughtEnd("s1");

    expect(result.success).toBe(true);
    expect(commitMessages).toHaveLength(1);
    expect(commitMessages[0]).toContain("duplication");
  });

  it("commits normally when duplication is below warningThreshold", async () => {
    const { service, commitMessages } = makeService({
      duplication: { percentage: 5, duplicatedLines: 1, clones: [{}] },
    });

    const result = await service.handleThoughtEnd("s1");

    expect(result.success).toBe(true);
    expect(commitMessages).toHaveLength(1);
    expect(commitMessages[0]).not.toContain("duplication");
  });

  it("respects custom blockThreshold configuration", async () => {
    // block at 50% instead of default 30%
    const { service } = makeService({
      duplication: { percentage: 35, duplicatedLines: 7, clones: [{}] },
      blockThreshold: 50,
    });

    const result = await service.handleThoughtEnd("s1");

    // 35% < 50% block threshold → should succeed
    expect(result.success).toBe(true);
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
