import { describe, it, expect } from "bun:test";
import { syncSessionViaAssignedAgent } from "../src/auto-commit/routes";

describe("syncSessionViaAssignedAgent", () => {
  it("should use assignedAgentId from active chat thread when session has no assignedAgentId", async () => {
    const mockSession = {
      id: "test-session",
      assignedAgentId: undefined, // No agent at session level
      chatThreads: [
        {
          id: "thread-1",
          name: "Main Thread",
          model: "test-model",
          mode: "test-mode",
          acpSessionId: null,
          assignedAgentId: "agent-123", // Agent assigned to thread
          state: "active",
          createdAt: new Date().toISOString(),
        },
      ],
      activeChatThreadId: "thread-1",
      agentWorkspacePath: "/test/workspace",
    };

    // Mock agent WebSocket (offline to skip the full flow)
    const mockAgentWs = {
      readyState: 0, // Not OPEN
    };

    let capturedAgentId: string | null = null;
    const context = {
      autoCommitService: {
        getSyncStatus: async () => ({
          syncState: "idle",
          lastSyncAt: undefined,
          lastSyncError: undefined,
        }),
      },
      sessionRepository: {
        findById: async () => mockSession,
        update: async () => mockSession,
        getFossilPath: () => "/test.fossil",
      },
      agentService: {
        getAgentConnection: (agentId: string) => {
          capturedAgentId = agentId;
          return mockAgentWs;
        },
      },
      sccService: {
        invalidateCache: () => {},
      },
    };

    const result = await syncSessionViaAssignedAgent("test-session", context as any);

    // Verify that it looked for agent-123 from the active thread
    expect(capturedAgentId).toBe("agent-123");
    // Should report offline since agent is not in OPEN state
    expect(result.message).toBe("Assigned agent is offline");
  });

  it("should fall back to session.assignedAgentId for backward compatibility", async () => {
    const mockSession = {
      id: "test-session",
      assignedAgentId: "session-agent-456", // Agent at session level
      chatThreads: [],
      activeChatThreadId: null,
      agentWorkspacePath: "/test/workspace",
    };

    let capturedAgentId: string | null = null;
    const context = {
      autoCommitService: {
        getSyncStatus: async () => ({
          syncState: "idle",
          lastSyncAt: undefined,
          lastSyncError: undefined,
        }),
      },
      sessionRepository: {
        findById: async () => mockSession,
        update: async () => mockSession,
        getFossilPath: () => "/test.fossil",
      },
      agentService: {
        getAgentConnection: (agentId: string) => {
          capturedAgentId = agentId;
          return null; // Simulate offline agent
        },
      },
      sccService: {
        invalidateCache: () => {},
      },
    };

    const result = await syncSessionViaAssignedAgent("test-session", context as any);

    // Verify that it looked for session-agent-456 from the session
    expect(capturedAgentId).toBe("session-agent-456");
    // Should fail with offline since agent returned null
    expect(result.message).toBe("Assigned agent is offline");
  });

  it("should return error when no agent assigned at session or thread level", async () => {
    const mockSession = {
      id: "test-session",
      assignedAgentId: undefined,
      chatThreads: [
        {
          id: "thread-1",
          name: "Main Thread",
          model: "test-model",
          mode: "test-mode",
          acpSessionId: null,
          assignedAgentId: null, // No agent on thread either
          state: "active",
          createdAt: new Date().toISOString(),
        },
      ],
      activeChatThreadId: "thread-1",
      agentWorkspacePath: "/test/workspace",
    };

    const context = {
      autoCommitService: {
        getSyncStatus: async () => ({
          syncState: "idle",
          lastSyncAt: undefined,
          lastSyncError: undefined,
        }),
      },
      sessionRepository: {
        findById: async () => mockSession,
        update: async () => mockSession,
        getFossilPath: () => "/test.fossil",
      },
      agentService: {
        getAgentConnection: () => null,
      },
      sccService: {
        invalidateCache: () => {},
      },
    };

    const result = await syncSessionViaAssignedAgent("test-session", context as any);

    expect(result.success).toBe(false);
    expect(result.message).toBe("No agent assigned to this session");
  });

  it("should use first thread when no active thread is set", async () => {
    const mockSession = {
      id: "test-session",
      assignedAgentId: undefined,
      chatThreads: [
        {
          id: "thread-1",
          name: "Main Thread",
          model: "test-model",
          mode: "test-mode",
          acpSessionId: null,
          assignedAgentId: "agent-first", // Agent on first thread
          state: "active",
          createdAt: new Date().toISOString(),
        },
        {
          id: "thread-2",
          name: "Second Thread",
          model: "test-model",
          mode: "test-mode",
          acpSessionId: null,
          assignedAgentId: "agent-second",
          state: "active",
          createdAt: new Date().toISOString(),
        },
      ],
      activeChatThreadId: null, // No active thread set
      agentWorkspacePath: "/test/workspace",
    };

    const mockAgentWs = {
      readyState: 0, // Not OPEN
    };

    let capturedAgentId: string | null = null;
    const context = {
      autoCommitService: {
        getSyncStatus: async () => ({
          syncState: "idle",
          lastSyncAt: undefined,
          lastSyncError: undefined,
        }),
      },
      sessionRepository: {
        findById: async () => mockSession,
        update: async () => mockSession,
        getFossilPath: () => "/test.fossil",
      },
      agentService: {
        getAgentConnection: (agentId: string) => {
          capturedAgentId = agentId;
          return mockAgentWs;
        },
      },
      sccService: {
        invalidateCache: () => {},
      },
    };

    await syncSessionViaAssignedAgent("test-session", context as any);

    // Should use the first thread's agent when no active thread is set
    expect(capturedAgentId).toBe("agent-first");
  });
});
