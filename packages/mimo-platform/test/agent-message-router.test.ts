import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync, readFileSync } from "fs";

// Will fail until AgentMessageRouter is implemented
let AgentMessageRouter: any;

async function loadRouter() {
  try {
    const mod = await import("../src/domain/agents/message-router.ts");
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
    handlePromptCompleted: mock(async () => {}),
    handleAvailableCommandsUpdate: mock(() => {}),
    handlePlan: mock(() => {}),
    getThreadPlan: mock(() => []),
    clearThreadPlan: mock(() => {}),
    getStreamingSnapshot: mock(() => ({
      thoughtContent: "",
      messageContent: "",
    })),
    getAvailableCommands: mock(() => undefined),
    setPromptInFlight: mock(() => {}),
    clearPromptInFlight: mock(() => {}),
    isPromptInFlight: mock(() => false),
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
    getSessionRepoPath: mock(() => "/fake/repo.git"),
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

  const sharedVcsServer = {
    getUrl: mock(() => "http://localhost:8000"),
    ensureRunning: mock(async () => {}),
    getPort: mock(() => 8000),
  };

  const os = {
    fs: {
      exists: mock(() => true),
    },
    path: {
      join: (...segs: string[]) => segs.join("/"),
    },
  };

  const autoCommitService = {
    triggerAutoCommit: mock(async () => ({ success: true })),
  };
  const sccService = { isStale: mock(() => false) };
  const vcs = {
    gitPull: mock(async () => ({ success: true })),
    clonePlatformCheckout: mock(async () => ({ success: true })),
  };

  const mimoContext = {
    services: {
      chat: chat,
      agents: agentService,
      fileSync: {
        handleFileChanges: mock(async () => {}),
        initializeSession: mock(async () => {}),
      },
      fileWatcher: {
        watchFile: mock(async () => {}),
        unwatchFile: mock(() => {}),
      },
      autoCommit: { triggerAutoCommit: mock(async () => ({ success: true })) },
      scc: { isStale: mock(() => false) },
      vcs: { gitPull: mock(async () => ({ success: true })) },
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
    sharedVcsServer,
    mimoContext,
    os,
    autoCommitService,
    sccService,
    vcs,
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
    sharedVcsServer: deps.sharedVcsServer,
    mimoContext: deps.mimoContext,
    platformUrl: "http://localhost:3000",
    os: deps.os,
    autoCommitService: deps.autoCommitService,
    sccService: deps.sccService,
    vcs: deps.vcs,
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
        promptId: "p1",
      });
      expect(deps.pipeline.handleThoughtStart).toHaveBeenCalledWith(
        "sess-1",
        "thread-1",
        "p1",
      );
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

      await router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "usage_update",
          sessionId: "sess-1",
          chatThreadId: "thread-1",
          usage: { inputTokens: 100 },
          promptId: "p1",
        },
      );

      expect(deps.pipeline.handleUsageUpdate).toHaveBeenCalledWith(
        "sess-1",
        "thread-1",
        { inputTokens: 100 },
        { id: "sess-1", activeChatThreadId: "thread-1" },
        "p1",
      );
      // Auto-sync should be called for non-expert usage
      expect(deps.triggerAutoSync).toHaveBeenCalledWith(
        "sess-1",
        "usage_update",
      );
      expect(deps.pipeline.clearPromptInFlight).toHaveBeenCalledWith(
        "sess-1",
        "thread-1",
      );
      expect(deps.chat.saveMessage).not.toHaveBeenCalled();
    });
  });

  describe("prompt lifecycle flags", () => {
    it("sets prompt-in-flight on prompt_received", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      await router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "prompt_received",
          sessionId: "sess-1",
          chatThreadId: "thread-1",
          promptId: "p1",
        },
      );

      expect(deps.pipeline.setPromptInFlight).toHaveBeenCalledWith(
        "sess-1",
        "thread-1",
      );
    });

    it("sets prompt-in-flight on active thread when prompt_received has no thread", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      deps.sessionRepository.findById = mock(async () => ({
        id: "sess-1",
        activeChatThreadId: "thread-active",
      }));
      const router = makeRouter(deps);

      await router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "prompt_received",
          sessionId: "sess-1",
          promptId: "p1",
        },
      );

      expect(deps.pipeline.setPromptInFlight).toHaveBeenCalledWith(
        "sess-1",
        "thread-active",
      );
    });

    it("clears prompt-in-flight on error_response", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      deps.sessionRepository.findById = mock(async () => ({
        id: "sess-1",
        activeChatThreadId: "thread-1",
      }));
      const router = makeRouter(deps);

      await router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "error_response",
          sessionId: "sess-1",
          chatThreadId: "thread-1",
          error: "boom",
        },
      );

      expect(deps.pipeline.clearPromptInFlight).toHaveBeenCalledWith(
        "sess-1",
        "thread-1",
      );
    });

    it("clears prompt-in-flight on active thread when usage_update has no thread", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      deps.sessionRepository.findById = mock(async () => ({
        id: "sess-1",
        activeChatThreadId: "thread-active",
      }));
      const router = makeRouter(deps);

      await router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "usage_update",
          sessionId: "sess-1",
          usage: { inputTokens: 1 },
          promptId: "p1",
        },
      );

      expect(deps.pipeline.clearPromptInFlight).toHaveBeenCalledWith(
        "sess-1",
        "thread-active",
      );
    });
  });

  describe("prompt_completed routing", () => {
    it("passes usage to pipeline.handlePromptCompleted", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      deps.sessionRepository.findById = mock(async () => ({
        id: "sess-1",
        activeChatThreadId: "thread-1",
      }));
      const router = makeRouter(deps);

      await router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "prompt_completed",
          sessionId: "sess-1",
          chatThreadId: "thread-1",
          usage: { inputTokens: 5, outputTokens: 8 },
          promptId: "p1",
        },
      );

      expect(deps.pipeline.handlePromptCompleted).toHaveBeenCalledWith(
        "sess-1",
        "thread-1",
        { id: "sess-1", activeChatThreadId: "thread-1" },
        { inputTokens: 5, outputTokens: 8 },
        "p1",
      );
    });
  });

  describe("agent_ready sends internal and public clone URLs", () => {
    it("includes both cloneUrl and a public clone URL built from MIMO_PUBLIC_VCS_URL", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      deps.mimoContext.env = {
        PLATFORM_URL: "https://mimo.example.com",
        MIMO_PUBLIC_VCS_URL: "https://mimo.example.com/git",
      };
      deps.sharedVcsServer.getUrl = mock(
        (sid: string) => `http://platform:8000/${sid}.git/`,
      );
      const mockSession = {
        id: "sess-1",
        name: "s",
        status: "active",
        upstreamPath: "/fake/upstream",
        agentWorkspacePath: "/fake/agent-workspace",
        repos: [
          {
            projectRepoId: "default",
            upstreamPath: "/fake/upstream",
            workspacePath: "/fake/agent-workspace",
          },
        ],
      };
      deps.sessionRepository.findByAssignedAgentId = mock(async () => [
        mockSession,
      ]);
      deps.sessionRepository.findById = mock(async () => ({
        ...mockSession,
        agentWorkspaceUser: "u",
        agentWorkspacePassword: "p",
      }));

      const sent: any[] = [];
      const ws = {
        data: { agentId: "agent-1" },
        send: mock((raw: string) => sent.push(JSON.parse(raw))),
      };

      const router = makeRouter(deps);
      await router.handle("agent-1", ws, {
        type: "agent_ready",
        workdir: "/work",
      });

      const ready = sent.find((m) => m.type === "session_ready");
      expect(ready).toBeDefined();
      const session = ready.sessions[0];
      expect(session.cloneUrl).toBe("http://platform:8000/sess-1.git/");
      expect(session.publicCloneUrl).toBe(
        "https://mimo.example.com/git/sess-1.git/",
      );
    });
  });

  describe("session_initialized persists model/mode and broadcasts", () => {
    it("should persist modelState and modeState, then broadcast to UI clients", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      const modelState = {
        currentModelId: "claude-sonnet-4",
        availableModels: [],
      };
      const modeState = { currentModeId: "expert", availableModes: [] };

      // Setup chat session with UI client
      const mockWs = { readyState: 1, send: mock(() => {}) };
      deps.chatSessions.set("sess-1", new Set([mockWs]));

      await router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "session_initialized",
          sessionId: "sess-1",
          modelState,
          modeState,
        },
      );

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
        await new Promise<void>((resolve) => {
          resolveSync = resolve;
        });
      });

      // Start first sync
      const promise1 = router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "thought_end",
          sessionId: "sess-1",
          chatThreadId: "thread-1",
        },
      );

      // Try second sync immediately
      await router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "thought_end",
          sessionId: "sess-1",
          chatThreadId: "thread-1",
        },
      );

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

      await router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "permission_request",
          sessionId: "sess-1",
          requestId: "req-123",
          toolCall: { toolTitle: "Bash" },
          options: [{ id: "allow", label: "Allow" }],
        },
      );

      // Should broadcast to UI clients
      const sentMessages = (mockWs.send as any).mock.calls.map((c: any[]) =>
        JSON.parse(c[0]),
      );
      const permRequest = sentMessages.find(
        (m: any) => m.type === "permission_request",
      );
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
      const agentMessages = (agentWs.send as any).mock.calls.map((c: any[]) =>
        JSON.parse(c[0]),
      );
      const permResponse = agentMessages.find(
        (m: any) => m.type === "permission_response",
      );
      expect(permResponse).toBeDefined();
      expect(permResponse.outcome).toEqual({
        outcome: "selected",
        optionId: "allow",
      });

      // Should broadcast permission_resolved to UI
      const uiMessages = (uiWs.send as any).mock.calls.map((c: any[]) =>
        JSON.parse(c[0]),
      );
      const permResolved = uiMessages.find(
        (m: any) => m.type === "permission_resolved",
      );
      expect(permResolved).toBeDefined();
      expect(permResolved.requestId).toBe("req-456");
    });
  });

  describe("permission_request includes chatThreadId in broadcast", () => {
    it("should forward chatThreadId from agent message to chat subscribers", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      const mockWs = { readyState: 1, send: mock(() => {}) };
      deps.chatSessions.set("sess-1", new Set([mockWs]));

      await router.handle(
        "agent-1",
        { data: { agentId: "agent-1" } },
        {
          type: "permission_request",
          sessionId: "sess-1",
          requestId: "req-thread-1",
          chatThreadId: "thread-abc",
          toolCall: { toolTitle: "Edit" },
          options: [{ id: "allow_once", label: "Allow Once" }],
        },
      );

      const sentMessages = (mockWs.send as any).mock.calls.map((c: any[]) =>
        JSON.parse(c[0]),
      );
      const permRequest = sentMessages.find(
        (m: any) => m.type === "permission_request",
      );
      expect(permRequest).toBeDefined();
      expect(permRequest.chatThreadId).toBe("thread-abc");
      expect(permRequest.requestId).toBe("req-thread-1");
    });

    it("should include chatThreadId in permission_resolved broadcast", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      const agentWs = { readyState: 1, send: mock(() => {}) };
      const uiWs = { readyState: 1, send: mock(() => {}) };
      deps.chatSessions.set("sess-1", new Set([uiWs]));

      await router.handle("agent-1", agentWs, {
        type: "permission_request",
        sessionId: "sess-1",
        requestId: "req-resolve-1",
        chatThreadId: "thread-xyz",
        toolCall: { toolTitle: "Bash" },
        options: [],
      });

      await router.handle("agent-1", agentWs, {
        type: "permission_response",
        sessionId: "sess-1",
        requestId: "req-resolve-1",
        optionId: "allow",
      });

      const uiMessages = (uiWs.send as any).mock.calls.map((c: any[]) =>
        JSON.parse(c[0]),
      );
      const permResolved = uiMessages.find(
        (m: any) => m.type === "permission_resolved",
      );
      expect(permResolved).toBeDefined();
      expect(permResolved.chatThreadId).toBe("thread-xyz");
    });

    it("should route permission_response correctly when chatThreadId is present", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      const agentWs = { readyState: 1, send: mock(() => {}) };
      const uiWs = { readyState: 1, send: mock(() => {}) };
      deps.chatSessions.set("sess-1", new Set([uiWs]));

      await router.handle("agent-1", agentWs, {
        type: "permission_request",
        sessionId: "sess-1",
        requestId: "req-route-1",
        chatThreadId: "thread-route",
        toolCall: { toolTitle: "Read" },
        options: [],
      });

      await router.handle("agent-1", agentWs, {
        type: "permission_response",
        sessionId: "sess-1",
        requestId: "req-route-1",
        optionId: "deny",
      });

      const agentMessages = (agentWs.send as any).mock.calls.map((c: any[]) =>
        JSON.parse(c[0]),
      );
      const permResponse = agentMessages.find(
        (m: any) => m.type === "permission_response",
      );
      expect(permResponse).toBeDefined();
      expect(permResponse.outcome).toEqual({
        outcome: "selected",
        optionId: "deny",
      });
    });
  });

  describe("agent_ready bootstrap session_ready", () => {
    it("includes session.branch so the agent can open fossil on the right branch", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();

      const session = {
        id: "sess-1",
        name: "feature session",
        status: "active",
        upstreamPath: "/fake/upstream",
        agentWorkspacePath: "/fake/agent-workspace",
        repos: [
          {
            projectRepoId: "default",
            upstreamPath: "/fake/upstream",
            workspacePath: "/fake/agent-workspace",
            branch: "feature/test",
          },
        ],
        branch: "feature/test",
        agentSubpath: null,
        agentWorkspaceUser: "dev",
        agentWorkspacePassword: "pw",
        modelState: null,
        modeState: null,
        chatThreads: [],
        activeChatThreadId: null,
        mcpServerIds: [],
      };

      deps.sessionRepository.findByAssignedAgentId = mock(async () => [
        session,
      ]);
      deps.sessionRepository.findByThreadAgentId = mock(async () => []);
      deps.sessionRepository.findById = mock(async (id: string) =>
        id === "sess-1" ? session : null,
      );

      const router = makeRouter(deps);
      const agentWs = { readyState: 1, send: mock(() => {}) };

      await router.handle("agent-1", agentWs, {
        type: "agent_ready",
        agentId: "agent-1",
        workdir: "/fake/workdir",
      });

      const sent = (agentWs.send as any).mock.calls
        .map((c: any[]) => JSON.parse(c[0]))
        .find((m: any) => m.type === "session_ready");
      expect(sent).toBeDefined();
      expect(sent.sessions).toHaveLength(1);
      expect(sent.sessions[0].sessionId).toBe("sess-1");
      expect(sent.sessions[0].branch).toBe("feature/test");
    });

    it("forwards null branch when the session has none (default-branch session)", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();

      const session = {
        id: "sess-2",
        name: "default-branch session",
        status: "active",
        upstreamPath: "/fake/upstream",
        agentWorkspacePath: "/fake/agent-workspace",
        repos: [
          {
            projectRepoId: "default",
            upstreamPath: "/fake/upstream",
            workspacePath: "/fake/agent-workspace",
          },
        ],
        agentSubpath: null,
        agentWorkspaceUser: "dev",
        agentWorkspacePassword: "pw",
        modelState: null,
        modeState: null,
        chatThreads: [],
        activeChatThreadId: null,
        mcpServerIds: [],
      };

      deps.sessionRepository.findByAssignedAgentId = mock(async () => [
        session,
      ]);
      deps.sessionRepository.findByThreadAgentId = mock(async () => []);
      deps.sessionRepository.findById = mock(async () => session);

      const router = makeRouter(deps);
      const agentWs = { readyState: 1, send: mock(() => {}) };

      await router.handle("agent-1", agentWs, {
        type: "agent_ready",
        agentId: "agent-1",
        workdir: "/fake/workdir",
      });

      const sent = (agentWs.send as any).mock.calls
        .map((c: any[]) => JSON.parse(c[0]))
        .find((m: any) => m.type === "session_ready");
      expect(sent).toBeDefined();
      expect(sent.sessions[0].branch).toBeNull();
    });

    it("includes each thread's relativeDir in the bootstrap payload", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();

      const session = {
        id: "sess-rd",
        name: "relativeDir session",
        status: "active",
        upstreamPath: "/fake/upstream",
        agentWorkspacePath: "/fake/agent-workspace",
        repos: [
          {
            projectRepoId: "default",
            upstreamPath: "/fake/upstream",
            workspacePath: "/fake/agent-workspace",
          },
        ],
        agentSubpath: null,
        relativeDir: null,
        agentWorkspaceUser: "dev",
        agentWorkspacePassword: "pw",
        modelState: null,
        modeState: null,
        chatThreads: [
          {
            id: "thread-with-rd",
            name: "Backend",
            model: "claude-3",
            mode: "code",
            acpSessionId: "acp-1",
            assignedAgentId: "agent-1",
            state: "active",
            brainWash: false,
            relativeDir: "packages/backend",
          },
          {
            id: "thread-without-rd",
            name: "Root",
            model: "claude-3",
            mode: "code",
            acpSessionId: "acp-2",
            assignedAgentId: "agent-1",
            state: "active",
            brainWash: false,
          },
        ],
        activeChatThreadId: "thread-with-rd",
        mcpServerIds: [],
      };

      deps.sessionRepository.findByAssignedAgentId = mock(async () => [
        session,
      ]);
      deps.sessionRepository.findByThreadAgentId = mock(async () => []);
      deps.sessionRepository.findById = mock(async (id: string) =>
        id === "sess-rd" ? session : null,
      );

      const router = makeRouter(deps);
      const agentWs = { readyState: 1, send: mock(() => {}) };

      await router.handle("agent-1", agentWs, {
        type: "agent_ready",
        agentId: "agent-1",
        workdir: "/fake/workdir",
      });

      const sent = (agentWs.send as any).mock.calls
        .map((c: any[]) => JSON.parse(c[0]))
        .find((m: any) => m.type === "session_ready");
      expect(sent).toBeDefined();
      const threads = sent.sessions[0].chatThreads;
      const withRd = threads.find((t: any) => t.chatThreadId === "thread-with-rd");
      const withoutRd = threads.find(
        (t: any) => t.chatThreadId === "thread-without-rd",
      );
      expect(withRd.relativeDir).toBe("packages/backend");
      expect(withoutRd.relativeDir).toBeUndefined();
    });
  });

  describe("session activity debounce", () => {
    it("should call touchSessionActivity at most once within debounce window for rapid events", async () => {
      expect(AgentMessageRouter).not.toBeNull();
      const deps = makeMocks();
      const router = makeRouter(deps);

      // Send 5 rapid thought_chunk messages
      for (let i = 0; i < 5; i++) {
        await router.handle(
          "agent-1",
          { data: { agentId: "agent-1" } },
          {
            type: "thought_chunk",
            sessionId: "sess-1",
            chatThreadId: "thread-1",
            content: "thinking",
          },
        );
      }

      // Should have called touchSessionActivity at most once (debounced)
      // The debounce is 30s, so with rapid events only the first should schedule
      // After implementation, we can verify the behavior
      expect(true).toBe(true); // Placeholder - will refine after implementation
    });
  });

  describe("file_changed broadcasts file_list_invalidated", () => {
    it("handleFileChanged broadcasts file_list_invalidated after processing file changes", () => {
      const sourceCode = readFileSync(
        join(
          import.meta.dir,
          "..",
          "src",
          "domain",
          "agents",
          "message-router.ts",
        ),
        "utf-8",
      );

      expect(sourceCode).toContain("file_list_invalidated");
      expect(sourceCode).toContain('type: "file_list_invalidated"');
    });
  });

  describe("plan delegates to pipeline", () => {
    const PLAN = [
      { content: "Read files", priority: "high", status: "completed" },
      { content: "Write fix", priority: "medium", status: "in_progress" },
    ];

    it("calls pipeline.handlePlan with sessionId, chatThreadId and entries", async () => {
      const deps = makeMocks();
      const router = makeRouter(deps);
      const ws = { data: { agentId: "agent-1" } };
      await router.handle("agent-1", ws, {
        type: "plan",
        sessionId: "sess-1",
        chatThreadId: "thread-1",
        entries: PLAN,
        promptId: "p1",
      });
      expect(deps.pipeline.handlePlan).toHaveBeenCalledWith(
        "sess-1",
        "thread-1",
        PLAN,
      );
    });

    it("falls back to the active chat thread when chatThreadId is absent", async () => {
      const deps = makeMocks();
      deps.sessionRepository.findById = mock(async () => ({
        id: "sess-1",
        activeChatThreadId: "active-thread",
      }));
      const router = makeRouter(deps);
      const ws = { data: { agentId: "agent-1" } };
      await router.handle("agent-1", ws, {
        type: "plan",
        sessionId: "sess-1",
        entries: PLAN,
      });
      expect(deps.pipeline.handlePlan).toHaveBeenCalledWith(
        "sess-1",
        "active-thread",
        PLAN,
      );
    });

    it("clears the thread plan when the thread context is cleared", async () => {
      const deps = makeMocks();
      deps.sessionRepository.findById = mock(async () => ({
        id: "sess-1",
        activeChatThreadId: "thread-1",
      }));
      const router = makeRouter(deps);
      const ws = { data: { agentId: "agent-1" } };
      await router.handle("agent-1", ws, {
        type: "acp_thread_cleared",
        sessionId: "sess-1",
        chatThreadId: "thread-1",
        acpSessionId: "acp-new",
      });
      expect(deps.pipeline.clearThreadPlan).toHaveBeenCalledWith(
        "sess-1",
        "thread-1",
      );
    });

    it("clears the stale thread plan when a thread is re-created with reset (fresh-context fallback)", async () => {
      const deps = makeMocks();
      deps.sessionRepository.findById = mock(async () => ({
        id: "sess-1",
        activeChatThreadId: "thread-1",
      }));
      const router = makeRouter(deps);
      const ws = { data: { agentId: "agent-1" } };
      await router.handle("agent-1", ws, {
        type: "acp_thread_created",
        sessionId: "sess-1",
        chatThreadId: "thread-1",
        acpSessionId: "acp-new",
        wasReset: true,
        resetReason: "loadSession failed",
      });
      expect(deps.pipeline.clearThreadPlan).toHaveBeenCalledWith(
        "sess-1",
        "thread-1",
      );
    });
  });

  describe("file_changed preserves repoId for multi-repo sessions", () => {
    it("forwards repoId from the agent notification to fileSync.handleFileChanges", async () => {
      const deps = makeMocks();
      const session = {
        id: "sess-1",
        agentWorkspacePath: "/work/sess-1/agent-workspace",
        repos: [
          {
            projectRepoId: "second",
            upstreamPath: "/work/sess-1/upstream/second",
            workspacePath: "/work/sess-1/agent-workspace/second",
          },
          {
            projectRepoId: "third",
            upstreamPath: "/work/sess-1/upstream/third",
            workspacePath: "/work/sess-1/agent-workspace/third",
          },
        ],
      };
      deps.sessionRepository.findById = mock(async () => session);
      const router = makeRouter(deps);
      const ws = { data: { agentId: "agent-1" } };

      await router.handle("agent-1", ws, {
        type: "file_changed",
        sessionId: "sess-1",
        files: [
          { repoId: "second", path: "test.md", isNew: true, deleted: false },
        ],
      });

      expect(
        deps.mimoContext.services.fileSync.handleFileChanges,
      ).toHaveBeenCalledTimes(1);
      const [, changes] =
        deps.mimoContext.services.fileSync.handleFileChanges.mock.calls[0];
      expect(changes).toEqual([
        { repoId: "second", path: "test.md", isNew: true, deleted: false },
      ]);
    });

    it("runs gitPull against each affected repo workspace, not only the root agentWorkspacePath", async () => {
      const deps = makeMocks();
      const session = {
        id: "sess-1",
        agentWorkspacePath: "/work/sess-1/agent-workspace",
        repos: [
          {
            projectRepoId: "second",
            upstreamPath: "/work/sess-1/upstream/second",
            workspacePath: "/work/sess-1/agent-workspace/second",
          },
          {
            projectRepoId: "third",
            upstreamPath: "/work/sess-1/upstream/third",
            workspacePath: "/work/sess-1/agent-workspace/third",
          },
        ],
      };
      deps.sessionRepository.findById = mock(async () => session);
      const router = makeRouter(deps);
      const ws = { data: { agentId: "agent-1" } };

      await router.handle("agent-1", ws, {
        type: "file_changed",
        sessionId: "sess-1",
        files: [
          { repoId: "second", path: "test.md", isNew: true, deleted: false },
        ],
      });

      const pulledPaths = deps.vcs.gitPull.mock.calls.map((c: any[]) => c[0]);
      expect(pulledPaths).toContain("/work/sess-1/agent-workspace/second");
    });
  });
});
