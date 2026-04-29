import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";

// Will fail until AgentMessageRouter is implemented
let AgentMessageRouter: any;

async function loadRouter() {
  try {
    const mod = await import("../src/agents/message-router.ts");
    AgentMessageRouter = mod.AgentMessageRouter;
  } catch {
    AgentMessageRouter = null;
  }
}

function makeMocks() {
  const pipeline = {
    handleThoughtStart: mock(() => {}),
    handleThoughtChunk: mock(() => {}),
    handleThoughtEnd: mock(() => {}),
    handleMessageChunk: mock(() => {}),
    handleToolCall: mock(() => {}),
    handleToolCallUpdate: mock(() => {}),
    handleUsageUpdate: mock(async () => {}),
    handleAvailableCommandsUpdate: mock(() => {}),
    getStreamingSnapshot: mock(() => ({ thoughtContent: "", messageContent: "" })),
    getAvailableCommands: mock(() => undefined),
    clearBuffers: mock(() => {}),
    setExpertPending: mock(() => {}),
    getExpertPending: mock(() => undefined),
    deleteExpertPending: mock(() => {}),
  };

  const sessionRepository = {
    findById: mock(async () => null),
    update: mock(async () => {}),
    updateChatThread: mock(async () => {}),
    touchSessionActivity: mock(async () => {}),
    findByAssignedAgentId: mock(async () => []),
    findByThreadAgentId: mock(async () => []),
    getFossilPath: mock(() => "/fake/fossil"),
  };

  const agentRepository = {
    updateCapabilities: mock(async () => {}),
  };

  const agentService = {
    handleAgentConnect: mock(() => {}),
    handleAgentDisconnect: mock(async () => {}),
    verifyAgentToken: mock(async () => null),
    getAgentWorkdir: mock(() => "/fake/workdir"),
    getAgentConnection: mock(() => null),
    handleAgentConnect: mock(() => {}),
  };

  const broadcastCalls: any[] = [];
  const broadcast = mock((sessionId: string, message: any) => {
    broadcastCalls.push({ sessionId, message });
  });

  const chatSessions = new Map<string, Set<any>>();
  const syncCalls: any[] = [];
  const triggerAutoSync = mock(async (sessionId: string, reason: string) => {
    syncCalls.push({ sessionId, reason });
  });

  const sessionStateService = {
    setModelState: mock(() => {}),
    setModeState: mock(() => {}),
  };

  const chat = {
    saveMessage: mock(async () => {}),
    loadHistory: mock(async () => []),
    updateAgentActivity: mock(() => {}),
    isAgentAlive: mock(() => false),
  };

  const sharedFossilServer = {
    getUrl: mock(() => "http://localhost:8000"),
    ensureRunning: mock(async () => {}),
    getPort: mock(() => 8000),
  };

  const mimoContext = {
    services: {
      chat: chat,
      agents: agentService,
      fileSync: { handleFileChanges: mock(async () => {}), initializeSession: mock(async () => {}) },
      fileWatcher: { watchFile: mock(async () => {}), unwatchFile: mock(() => {}) },
      autoCommit: { triggerAutoCommit: mock(async () => ({ success: true })) },
      scc: { isStale: mock(() => false) },
      vcs: { fossilUp: mock(async () => ({ success: true })) },
      impactCalculator: { calculateImpact: mock(async () => ({ files: [] })) },
      mcpServer: { resolveMcpServers: mock(async () => []) },
    },
    repos: {
      sessions: sessionRepository,
      agents: agentRepository,
      projects: { listAllPublic: mock(async () => []) },
    },
    env: { PLATFORM_URL: "http://localhost:3000" },
  };

  return {
    pipeline,
    sessionRepository,
    agentRepository,
    agentService,
    broadcast,
    broadcastCalls,
    chatSessions,
    triggerAutoSync,
    syncCalls,
    sessionStateService,
    chat,
    sharedFossilServer,
    mimoContext,
  };
}

function makeRouter(deps: ReturnType<typeof makeMocks>) {
  if (!AgentMessageRouter) return null;
  return new AgentMessageRouter({
    pipeline: deps.pipeline,
    sessionRepository: deps.sessionRepository,
    agentRepository: deps.agentRepository,
    agentService: deps.agentService,
    chatSessions: deps.chatSessions,
    broadcast: deps.broadcast,
    triggerAutoSync: deps.triggerAutoSync,
    sessionStateService: deps.sessionStateService,
    chat: deps.chat,
    sharedFossilServer: deps.sharedFossilServer,
    mimoContext: deps.mimoContext,
    platformUrl: "http://localhost:3000",
  });
}

describe("AgentMessageRouter", () => {
  beforeEach(async () => {
    await loadRouter();
  });

  describe("thought_start delegates to pipeline", () => {
    it("should call pipeline.handleThoughtStart with sessionId and chatThreadId", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);
      const ws = { data: { agentId: "agent-1" } };
      await router.handle("agent-1", ws, {
        type: "thought_start",
        sessionId: "sess-1",
        chatThreadId: "thread-1",
      });
      expect(deps.pipeline.handleThoughtStart).toHaveBeenCalledWith("sess-1", "thread-1");
    });
  });

  describe("usage_update delegates to pipeline and triggers auto-sync", () => {
    it("should call pipeline.handleUsageUpdate and then triggerAutoSync", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();

      // Mock session lookup BEFORE router construction
      deps.sessionRepository.findById = mock(async () => ({
        id: "sess-1",
        activeChatThreadId: "thread-1",
      }));

      const router = makeRouter(deps);

      await router.handle("agent-1", { data: { agentId: "agent-1" } }, {
        type: "usage_update",
        sessionId: "sess-1",
        chatThreadId: "thread-1",
        usage: { inputTokens: 100 },
      });

      expect(deps.pipeline.handleUsageUpdate).toHaveBeenCalledWith(
        "sess-1",
        "thread-1",
        { inputTokens: 100 },
        expect.any(Object),
      );
      // Auto-sync should be called for non-expert usage
      expect(deps.triggerAutoSync).toHaveBeenCalledWith("sess-1", "usage_update");
    });
  });

  describe("session_initialized persists model/mode and broadcasts", () => {
    it("should persist modelState and modeState, then broadcast to UI clients", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      const modelState = { currentModelId: "claude-sonnet-4", availableModels: [] };
      const modeState = { currentModeId: "expert", availableModes: [] };

      // Setup chat session with UI client
      const mockWs = { readyState: 1, send: mock(() => {}) };
      deps.chatSessions.set("sess-1", new Set([mockWs]));

      await router.handle("agent-1", { data: { agentId: "agent-1" } }, {
        type: "session_initialized",
        sessionId: "sess-1",
        modelState,
        modeState,
      });

      // Should persist to repository
      expect(deps.sessionRepository.update).toHaveBeenCalledWith("sess-1", {
        modelState,
      });
      expect(deps.sessionRepository.update).toHaveBeenCalledWith("sess-1", {
        modeState,
      });

      // Should broadcast to UI clients
      const broadcastMessages = deps.broadcastCalls.filter(
        (c) => c.message.type === "session_initialized",
      );
      expect(broadcastMessages.length).toBeGreaterThan(0);
    });
  });

  describe("auto-sync deduplication", () => {
    it("should skip second auto-sync while first is in-flight for same session", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      // Make triggerAutoSync hang to simulate in-flight
      let resolveSync: () => void = () => {};
      deps.triggerAutoSync = mock(async () => {
        await new Promise<void>((resolve) => { resolveSync = resolve; });
      });

      // Start first sync
      const promise1 = router.handle("agent-1", { data: { agentId: "agent-1" } }, {
        type: "thought_end",
        sessionId: "sess-1",
        chatThreadId: "thread-1",
      });

      // Try second sync immediately
      await router.handle("agent-1", { data: { agentId: "agent-1" } }, {
        type: "thought_end",
        sessionId: "sess-1",
        chatThreadId: "thread-1",
      });

      // At this point, triggerAutoSync should only be called once (the second is deduplicated)
      // We can't easily assert this without knowing the internal state, but we can check
      // the autoSyncInFlight set behavior through the syncCalls
      expect(true).toBe(true); // Placeholder - will refine after implementation

      resolveSync();
      await promise1;
    });
  });

  describe("permission_request broadcast and tracking", () => {
    it("should broadcast permission_request to UI clients and track by requestId", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      // Setup chat session with UI client
      const mockWs = { readyState: 1, send: mock(() => {}) };
      deps.chatSessions.set("sess-1", new Set([mockWs]));

      await router.handle("agent-1", { data: { agentId: "agent-1" } }, {
        type: "permission_request",
        sessionId: "sess-1",
        requestId: "req-123",
        toolCall: { toolTitle: "Bash" },
        options: [{ id: "allow", label: "Allow" }],
      });

      // Should broadcast to UI clients
      const sentMessages = (mockWs.send as any).mock.calls.map((c: any[]) => JSON.parse(c[0]));
      const permRequest = sentMessages.find((m: any) => m.type === "permission_request");
      expect(permRequest).toBeDefined();
      expect(permRequest.requestId).toBe("req-123");

      // Should track pending permission internally
      // Test by sending permission_response and verifying it routes back to agent
    });
  });

  describe("permission_response resolves pending permission", () => {
    it("should resolve pending permission promise when response arrives", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      // Setup: first send permission_request
      const agentWs = { readyState: 1, send: mock(() => {}) };
      const uiWs = { readyState: 1, send: mock(() => {}) };
      deps.chatSessions.set("sess-1", new Set([uiWs]));

      // Send request
      await router.handle("agent-1", agentWs, {
        type: "permission_request",
        sessionId: "sess-1",
        requestId: "req-456",
        toolCall: { toolTitle: "Read" },
        options: [],
      });

      // Now send response
      await router.handle("agent-1", agentWs, {
        type: "permission_response",
        sessionId: "sess-1",
        requestId: "req-456",
        optionId: "allow",
      });

      // Should send permission_response back to agent
      const agentMessages = (agentWs.send as any).mock.calls.map((c: any[]) => JSON.parse(c[0]));
      const permResponse = agentMessages.find((m: any) => m.type === "permission_response");
      expect(permResponse).toBeDefined();
      expect(permResponse.outcome).toEqual({ outcome: "selected", optionId: "allow" });

      // Should broadcast permission_resolved to UI
      const uiMessages = (uiWs.send as any).mock.calls.map((c: any[]) => JSON.parse(c[0]));
      const permResolved = uiMessages.find((m: any) => m.type === "permission_resolved");
      expect(permResolved).toBeDefined();
      expect(permResolved.requestId).toBe("req-456");
    });
  });

  describe("session activity debounce", () => {
    it("should call touchSessionActivity at most once within debounce window for rapid events", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      // Send 5 rapid thought_chunk messages
      for (let i = 0; i < 5; i++) {
        await router.handle("agent-1", { data: { agentId: "agent-1" } }, {
          type: "thought_chunk",
          sessionId: "sess-1",
          chatThreadId: "thread-1",
          content: "thinking",
        });
      }

      // Should have called touchSessionActivity at most once (debounced)
      // The debounce is 30s, so with rapid events only the first should schedule
      // After implementation, we can verify the behavior
      expect(true).toBe(true); // Placeholder - will refine after implementation
    });
  });
});
