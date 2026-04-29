/**
 * Failing integration tests for: pre-warm-thread-acp
 *
 * Tasks covered:
 *   1.1  request_state for cold thread starts ACP spawn without blocking
 *   1.2  thread enters "initializing" state after request_state triggers spawn
 *   1.3  second request_state for same cold thread does not start a duplicate spawn
 *   1.4  user_message arriving while "initializing" queues the prompt
 *   1.5  queued prompt is sent after ACP initialization completes
 *   1.6  thread transitions from "initializing" to "active" on successful ACP init
 */
import { describe, it, expect, mock } from "bun:test";
import { SessionLifecycleManager } from "../src/lifecycle.js";
import type { SessionLifecycleCallbacks } from "../src/lifecycle.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeCallbacks(
  overrides: Partial<SessionLifecycleCallbacks> = {},
): SessionLifecycleCallbacks {
  return {
    onStatusChange: overrides.onStatusChange ?? (() => {}),
    onCacheState: overrides.onCacheState ?? (() => {}),
    onGetCachedState: overrides.onGetCachedState ?? (() => undefined),
    onSpawnAcp: overrides.onSpawnAcp ?? (async () => null),
    onTerminateThread: overrides.onTerminateThread ?? (async () => {}),
  };
}

// ── Mocks for MimoAgent tests ─────────────────────────────────────────────

mock.module("jose", () => ({
  decodeJwt: () => ({ sub: "test-user" }),
}));

mock.module("ignore", () => ({
  default: () => ({
    add: () => ({ ignore: () => ({}) }),
  }),
}));

mock.module("@agentclientprotocol/sdk", () => {
  class ClientSideConnection {
    closed = Promise.resolve();
    constructor(_factory: unknown, _stream: unknown) {}
    async initialize() {
      return { protocolVersion: "1.0", agentCapabilities: { loadSession: true } };
    }
    async newSession() {
      return { sessionId: "test-acp-session" };
    }
    async prompt() {
      return {};
    }
  }
  class AgentSideConnection {
    closed = Promise.resolve();
    get signal() { return new AbortController().signal; }
    constructor(_factory: unknown, _stream: unknown) {}
  }
  return {
    PROTOCOL_VERSION: "1.0",
    ndJsonStream: () => ({}) as any,
    ClientSideConnection,
    AgentSideConnection,
  };
});

// ── Lifecycle manager tests ───────────────────────────────────────────────

describe("Thread pre-warm: SessionLifecycleManager", () => {
  // Task 1.2 — thread enters "initializing" state, setThreadState must be public
  it("setThreadState (public) can set thread state to initializing", () => {
    const manager = new SessionLifecycleManager(makeCallbacks());
    manager.initializeThread("s1", "t1", 0);

    // setThreadState must be public for this to work without 'as any'
    manager.setThreadState("s1", "t1", "initializing");

    expect(manager.getThreadState("s1", "t1")).toBe("initializing");
  });

  // Task 1.4 — user_message while initializing queues the prompt (does not reject)
  it("queueThreadPrompt for initializing thread queues without rejecting", async () => {
    const manager = new SessionLifecycleManager(makeCallbacks());
    manager.initializeThread("s1", "t1", 0);
    manager.setThreadState("s1", "t1", "initializing");

    let rejected = false;
    let settled = false;

    manager
      .queueThreadPrompt("s1", "t1", "hello")
      .then(() => { settled = true; })
      .catch(() => { rejected = true; settled = true; });

    // Give it a tick — should remain pending (queued, not resolved or rejected)
    await new Promise((r) => setTimeout(r, 20));

    expect(rejected).toBe(false);
    expect(settled).toBe(false);
  });

  // Task 1.5 — queued prompt resolves after ACP initialization completes
  it("queued prompt resolves when drainQueue is called after initialization", async () => {
    const manager = new SessionLifecycleManager(makeCallbacks());
    manager.initializeThread("s1", "t1", 0);
    manager.setThreadState("s1", "t1", "initializing");

    let resolved = false;

    manager
      .queueThreadPrompt("s1", "t1", "hello")
      .then(() => { resolved = true; });

    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    // Simulate initialization completing — must drain the queue
    manager.setThreadState("s1", "t1", "active");
    await manager.drainQueue("s1", "t1");

    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(true);
  });

  // Task 1.6 — thread transitions from "initializing" to "active"
  it("thread transitions from initializing to active after successful ACP init", async () => {
    const manager = new SessionLifecycleManager(makeCallbacks());
    manager.initializeThread("s1", "t1", 0);
    manager.setThreadState("s1", "t1", "initializing");

    expect(manager.getThreadState("s1", "t1")).toBe("initializing");

    // Simulate ACP spawn completing
    manager.setThreadState("s1", "t1", "active");
    await manager.drainQueue("s1", "t1");

    expect(manager.getThreadState("s1", "t1")).toBe("active");
  });
});

// ── MimoAgent-level tests ─────────────────────────────────────────────────

describe("Thread pre-warm: MimoAgent handleRequestState", () => {
  function buildMockDeps(lifecycleOverrides: Record<string, any> = {}) {
    const acpClients = new Map<string, any>();
    const lifecycleStates = new Map<string, string>();

    const lifecycleManager = {
      getThreadState: (s: string, t: string) =>
        lifecycleStates.get(`${s}:${t}`) ?? "active",
      setThreadState: (s: string, t: string, state: string) =>
        lifecycleStates.set(`${s}:${t}`, state),
      initializeThread: (s: string, t: string) => {
        if (!lifecycleStates.has(`${s}:${t}`))
          lifecycleStates.set(`${s}:${t}`, "active");
      },
      recordActivity: () => {},
      queueThreadPrompt: async () => {},
      endThread: () => {},
      endSession: () => {},
      drainQueue: async () => {},
      ...lifecycleOverrides,
    };

    const mockSessionManager = {
      getSession: () => ({
        sessionId: "s1",
        checkoutPath: "/tmp/s1",
        acpProcess: null,
        mcpServers: [],
        agentSubpath: undefined,
        modelState: undefined,
        modeState: undefined,
      }),
      setSessionAcpProcess: () => {},
      createSession: async () => ({ sessionId: "s1", checkoutPath: "/tmp/s1" }),
      setSessionState: () => {},
      setSessionMcpServers: () => {},
      setSessionAgentSubpath: () => {},
    };

    const mockProvider = {
      name: "test",
      spawn: () => ({
        process: {
          kill: () => {},
          on: () => {},
          killed: false,
          stderr: { on: () => {} },
        },
        input: new WritableStream<Uint8Array>(),
        output: new ReadableStream<Uint8Array>(),
      }),
      extractState: () => ({
        modelState: { currentModelId: "m", availableModels: [], optionId: "mo" },
        modeState: { currentModeId: "md", availableModes: [], optionId: "mdo" },
      }),
      setModel: async () => {},
      setMode: async () => {},
      mapUpdateType: () => null,
    };

    return {
      acpClients,
      lifecycleStates,
      lifecycleManager,
      deps: {
        os: {
          path: { join: (...parts: string[]) => parts.join("/"), homeDir: () => "/tmp" },
          fs: {
            exists: async () => false,
            mkdir: async () => {},
            readFile: async () => "",
            writeFile: async () => {},
            unlink: async () => {},
            copyFile: async () => {},
          },
          command: { run: async () => ({ success: true, output: "" }) },
          env: { getAll: () => ({}) },
        },
        config: {
          token: "test-token",
          platform: "ws://test",
          workDir: "/tmp/work",
          provider: "opencode" as const,
        },
        sessionManager: mockSessionManager as any,
        lifecycleManager: lifecycleManager as any,
        provider: mockProvider as any,
      },
    };
  }

  // Task 1.1 — request_state must not block on spawn
  it("request_state for cold thread starts ACP spawn without blocking", async () => {
    const { MimoAgent } = await import("../src/index.js");
    const { deps, acpClients, lifecycleStates } = buildMockDeps();

    const agent = new MimoAgent(deps);
    (agent as any).ws = { send: () => {}, readyState: 1 };
    (agent as any).acpClients = acpClients;

    let spawnStarted = false;
    let spawnCompleted = false;

    // Override ensureThreadRuntime to simulate a slow spawn
    (agent as any).ensureThreadRuntime = async (_s: string, _t: string) => {
      spawnStarted = true;
      await new Promise((r) => setTimeout(r, 300));
      spawnCompleted = true;
      return null;
    };

    const start = Date.now();
    await (agent as any).handleRequestState({
      type: "request_state",
      sessionId: "s1",
      chatThreadId: "t1",
    });
    const elapsed = Date.now() - start;

    expect(spawnStarted).toBe(true); // spawn was initiated
    expect(spawnCompleted).toBe(false); // but didn't complete — non-blocking
    expect(elapsed).toBeLessThan(100); // returned well before 300ms
  });

  // Task 1.3 — second request_state must not start duplicate spawn
  it("second request_state for same cold thread does not start a duplicate spawn", async () => {
    const { MimoAgent } = await import("../src/index.js");
    let spawnCount = 0;

    const { deps, acpClients, lifecycleStates } = buildMockDeps({
      // lifecycle manager tracks state so the guard works
      getThreadState: (s: string, t: string) =>
        lifecycleStates.get(`${s}:${t}`) ?? "active",
      setThreadState: (s: string, t: string, state: string) =>
        lifecycleStates.set(`${s}:${t}`, state),
    });

    const agent = new MimoAgent(deps);
    (agent as any).ws = { send: () => {}, readyState: 1 };
    (agent as any).acpClients = acpClients;

    (agent as any).ensureThreadRuntime = async (_s: string, _t: string) => {
      spawnCount++;
      await new Promise((r) => setTimeout(r, 300)); // slow spawn in-flight
      return null;
    };

    // Two rapid request_state messages for the same cold thread
    void (agent as any).handleRequestState({
      type: "request_state",
      sessionId: "s1",
      chatThreadId: "t1",
    });
    void (agent as any).handleRequestState({
      type: "request_state",
      sessionId: "s1",
      chatThreadId: "t1",
    });

    await new Promise((r) => setTimeout(r, 30));

    expect(spawnCount).toBe(1); // only one spawn, not two
  });
});
