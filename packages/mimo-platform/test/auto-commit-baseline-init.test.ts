// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import {
  syncSessionViaAssignedAgent,
  resolveAgentSyncNowResult,
} from "../src/api/rest/auto-commit";

/**
 * The platform records the git-range `baseline` the first time it establishes
 * its own checkout during a sync. The baseline is the seeded base commit, which
 * the upstream checkout still points at before any selective commit — captured
 * here so the commit preview / impact buffer can use `<baseline>..HEAD`.
 */
describe("syncSessionViaAssignedAgent baseline init", () => {
  function buildContext(mockSession: any) {
    const updates: any[] = [];
    const mockAgentWs = {
      readyState: 1, // OPEN
      send: (msg: string) => {
        const { requestId } = JSON.parse(msg);
        // The pending entry is registered before send() is called, so resolving
        // on the next tick mimics the agent reporting a successful sync.
        setTimeout(
          () =>
            resolveAgentSyncNowResult({
              requestId,
              sessionId: mockSession.id,
              success: true,
              noChanges: false,
            }),
          0,
        );
      },
    };
    const context: any = {
      autoCommitService: {
        getSyncStatus: async () => ({ syncState: "idle" }),
      },
      sessionRepository: {
        findById: async () => mockSession,
        update: async (_id: string, u: any) => {
          Object.assign(mockSession, u);
          updates.push(u);
          return mockSession;
        },
        getSessionRepoPath: () => "/repo.git",
      },
      agentService: { getAgentConnection: () => mockAgentWs },
      sccService: { invalidateCache: () => {} },
      os: {
        path: { join: (...a: string[]) => a.join("/") },
        fs: { exists: () => false }, // checkout marker missing -> first checkout
      },
      vcs: {
        clonePlatformCheckout: async () => ({ success: true }),
        gitPull: async () => ({ success: true }),
        revParse: async (_dir: string, _ref: string) => "seedsha",
      },
    };
    return { context, updates };
  }

  it("records the upstream HEAD as the baseline on the first checkout", async () => {
    const mockSession: any = {
      id: "s1",
      assignedAgentId: "agent-1",
      chatThreads: [],
      activeChatThreadId: null,
      upstreamPath: "/u",
      agentWorkspacePath: "/w",
      baseline: undefined,
    };
    const { context, updates } = buildContext(mockSession);

    const result = await syncSessionViaAssignedAgent("s1", context);

    expect(result.success).toBe(true);
    expect(updates.some((u) => u.baseline === "seedsha")).toBe(true);
    expect(mockSession.baseline).toBe("seedsha");
  });

  it("never overwrites an already-set baseline", async () => {
    const mockSession: any = {
      id: "s2",
      assignedAgentId: "agent-1",
      chatThreads: [],
      activeChatThreadId: null,
      upstreamPath: "/u",
      agentWorkspacePath: "/w",
      baseline: "existing-baseline",
    };
    const { context, updates } = buildContext(mockSession);

    await syncSessionViaAssignedAgent("s2", context);

    expect(updates.some((u) => "baseline" in u)).toBe(false);
    expect(mockSession.baseline).toBe("existing-baseline");
  });
});
