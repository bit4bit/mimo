import { describe, it, expect } from "bun:test";
import { createSessionDeletionUseCase } from "../src/sessions/session-deletion.js";

describe("session deletion revokes MCP token", () => {
  it("calls mcpTokenStore.revoke when mcpToken is present", async () => {
    const revoked: string[] = [];
    const useCase = createSessionDeletionUseCase({
      sessionRepository: {
        delete: async () => {},
      },
      sessionStateService: {
        clearSessionState: () => {},
      },
      fileSyncService: {
        cleanupSession: async () => {},
      },
      impactCalculator: {
        clearState: () => {},
      },
      agentService: {
        notifySessionEnded: async () => {},
      },
      mcpTokenStore: {
        revoke: (token: string) => revoked.push(token),
      },
    });

    await useCase.deleteSessionByRecord({
      id: "session-1",
      projectId: "project-1",
      assignedAgentId: undefined,
      chatThreads: [],
      mcpToken: "token-1",
    });

    expect(revoked).toEqual(["token-1"]);
  });
});

describe("session deletion notifies agents", () => {
  function makeUseCase(notified: Array<{ sessionId: string; agentId: string }>) {
    return createSessionDeletionUseCase({
      sessionRepository: { delete: async () => {} },
      sessionStateService: { clearSessionState: () => {} },
      fileSyncService: { cleanupSession: async () => {} },
      impactCalculator: { clearState: () => {} },
      agentService: {
        notifySessionEnded: async (sessionId, agentId) => {
          notified.push({ sessionId, agentId });
        },
      },
      mcpTokenStore: { revoke: () => {} },
    });
  }

  it("notifies agent from session-level assignedAgentId", async () => {
    const notified: Array<{ sessionId: string; agentId: string }> = [];
    const useCase = makeUseCase(notified);

    await useCase.deleteSessionByRecord({
      id: "s1",
      projectId: "p1",
      assignedAgentId: "agent-1",
      chatThreads: [],
    });

    expect(notified).toEqual([{ sessionId: "s1", agentId: "agent-1" }]);
  });

  it("notifies agents from thread-level assignedAgentId", async () => {
    const notified: Array<{ sessionId: string; agentId: string }> = [];
    const useCase = makeUseCase(notified);

    await useCase.deleteSessionByRecord({
      id: "s1",
      projectId: "p1",
      assignedAgentId: undefined,
      chatThreads: [
        { id: "t1", assignedAgentId: "agent-2" } as any,
        { id: "t2", assignedAgentId: "agent-3" } as any,
      ],
    });

    expect(notified.map((n) => n.agentId).sort()).toEqual(["agent-2", "agent-3"]);
  });

  it("deduplicates agents across session and threads", async () => {
    const notified: Array<{ sessionId: string; agentId: string }> = [];
    const useCase = makeUseCase(notified);

    await useCase.deleteSessionByRecord({
      id: "s1",
      projectId: "p1",
      assignedAgentId: "agent-1",
      chatThreads: [
        { id: "t1", assignedAgentId: "agent-1" } as any,
        { id: "t2", assignedAgentId: "agent-2" } as any,
      ],
    });

    expect(notified.map((n) => n.agentId).sort()).toEqual(["agent-1", "agent-2"]);
  });

  it("does not notify when no agents are assigned", async () => {
    const notified: Array<{ sessionId: string; agentId: string }> = [];
    const useCase = makeUseCase(notified);

    await useCase.deleteSessionByRecord({
      id: "s1",
      projectId: "p1",
      assignedAgentId: undefined,
      chatThreads: [{ id: "t1", assignedAgentId: null } as any],
    });

    expect(notified).toEqual([]);
  });
});
