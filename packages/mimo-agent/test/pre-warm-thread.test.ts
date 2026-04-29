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
import { waitFor } from "./test-helpers.js";

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

    // Should remain pending (queued, not resolved or rejected)
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

    expect(resolved).toBe(false);

    // Yield so the async queueThreadPrompt body executes and adds to queue
    await Promise.resolve();

    // Simulate initialization completing — must drain the queue
    manager.setThreadState("s1", "t1", "active");
    await manager.drainQueue("s1", "t1");

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
      // Simulate async work without blocking
      await Promise.resolve();
      spawnCompleted = true;
      return null;
    };

    await (agent as any).handleRequestState({
      type: "request_state",
      sessionId: "s1",
      chatThreadId: "t1",
    });

    expect(spawnStarted).toBe(true); // spawn was initiated
    expect(spawnCompleted).toBe(true); // completed synchronously in test
  });

  // Task 1.3 — second request_state must not start duplicate spawn
  it("second request_state for same cold thread does not start a duplicate spawn", async () => {
    const { MimoAgent } = await import("../src/index.js");
    let spawnCount = 0;

    const { deps, acpClients, lifecycleStates } = buildMockDeps({
      getThreadState: (s: string, t: string) =>
        lifecycleStates.get(`${s}:${t}`) ?? "active",
      setThreadState: (s: string, t: string, state: string) =>
        lifecycleStates.set(`${s}:${t}`, state),
    });

    const agent = new MimoAgent(deps);
    (agent as any).ws = { send: () => {}, readyState: 1 };
    (agent as any).acpClients = acpClients;

    // Mock the inner helper so the in-flight dedup wrapper still runs.
    let resolveSpawn: () => void;
    const spawnPromise = new Promise<void>((resolve) => {
      resolveSpawn = resolve;
    });
    (agent as any).doSpawnThreadRuntime = async (_s: string, _t: string) => {
      spawnCount++;
      await spawnPromise; // hold until we resolve
      return null;
    };

    // Two rapid request_state messages for the same cold thread
    const promise1 = (agent as any).handleRequestState({
      type: "request_state",
      sessionId: "s1",
      chatThreadId: "t1",
    });
    const promise2 = (agent as any).handleRequestState({
      type: "request_state",
      sessionId: "s1",
      chatThreadId: "t1",
    });

    // Should still be 1 spawn even while in-flight
    expect(spawnCount).toBe(1);

    // Resolve the spawn
    resolveSpawn!();
    await Promise.all([promise1, promise2]);

    expect(spawnCount).toBe(1); // only one spawn, not two
  });

  // The branch session is only for upstream; mimo-agent checkout should work
  // with a clean trunk. Even when session_ready carries a `branch`,
  // setupCheckout must open fossil without the branch arg.
  it("handleSessionReady opens fossil on trunk even when a branch is provided", async () => {
    const { MimoAgent } = await import("../src/index.js");
    const { deps } = buildMockDeps();

    type Cmd = string[];
    const commandsRun: Cmd[] = [];
    deps.os.command.run = (async (args: Cmd) => {
      commandsRun.push(args);
      return { success: true, output: "" };
    }) as any;

    // Simulate a fresh session: neither the .fossil file nor a prior checkout
    // exists, forcing the clone branch of setupCheckout.
    deps.os.fs.exists = (async () => false) as any;
    deps.os.fs.mkdir = (async () => {}) as any;

    const agent = new MimoAgent(deps);
    (agent as any).ws = { send: () => {}, readyState: 1 };

    await (agent as any).handleSessionReady({
      type: "session_ready",
      platformUrl: "http://test",
      sessions: [
        {
          sessionId: "s-branch",
          fossilUrl: "http://localhost:8000/",
          agentWorkspaceUser: "dev",
          agentWorkspacePassword: "pw",
          agentSubpath: null,
          branch: "feature/test",
          chatThreads: [],
        },
      ],
    });

    const openCmd = commandsRun.find(
      (c) => c[0] === "fossil" && c[1] === "open",
    );
    expect(openCmd).toBeDefined();
    // Expected: fossil open --nosync <repoPath> (no branch arg)
    expect(openCmd!).toContain("--nosync");
    expect(openCmd!).not.toContain("feature/test");
  });

  // Regression: a stray `.fslckout` in an ancestor of the per-session checkout
  // makes `fossil open` print "there is already an open tree" and exit 1.
  // Previously setupCheckout ignored os.command.run.success, so the empty
  // checkout dir was silently propagated and only surfaced later as the much
  // less helpful "ACP working directory does not exist" error.
  it("handleSessionReady surfaces a session_error when fossil open fails", async () => {
    const { MimoAgent } = await import("../src/index.js");
    const { deps } = buildMockDeps();

    deps.os.command.run = (async (args: string[]) => {
      // Clone succeeds; open fails like fossil does when an ancestor dir is
      // already an open tree.
      if (args[0] === "fossil" && args[1] === "open") {
        return {
          success: false,
          output: "",
          error: "there is already an open tree at /Users/x/.mimo-agent/",
          exitCode: 1,
        };
      }
      return { success: true, output: "", error: "", exitCode: 0 };
    }) as any;
    deps.os.fs.exists = (async () => false) as any;
    deps.os.fs.mkdir = (async () => {}) as any;

    const sentMessages: any[] = [];
    const agent = new MimoAgent(deps);
    (agent as any).ws = {
      send: (raw: string) => sentMessages.push(JSON.parse(raw)),
      readyState: 1,
    };

    await (agent as any).handleSessionReady({
      type: "session_ready",
      platformUrl: "http://test",
      sessions: [
        {
          sessionId: "s-poisoned",
          fossilUrl: "http://localhost:8000/",
          agentWorkspaceUser: "dev",
          agentWorkspacePassword: "pw",
          agentSubpath: null,
          branch: "CP-1784",
          chatThreads: [],
        },
      ],
    });

    const sessionError = sentMessages.find((m) => m.type === "session_error");
    expect(sessionError).toBeDefined();
    expect(sessionError.sessionId).toBe("s-poisoned");
    expect(sessionError.error).toContain("fossil open failed");
    expect(sessionError.error).toContain("already an open tree");
  });

  it("handleSessionReady falls back to branchless fossil open when no branch is provided", async () => {
    const { MimoAgent } = await import("../src/index.js");
    const { deps } = buildMockDeps();

    const commandsRun: string[][] = [];
    deps.os.command.run = (async (args: string[]) => {
      commandsRun.push(args);
      return { success: true, output: "" };
    }) as any;
    deps.os.fs.exists = (async () => false) as any;
    deps.os.fs.mkdir = (async () => {}) as any;

    const agent = new MimoAgent(deps);
    (agent as any).ws = { send: () => {}, readyState: 1 };

    await (agent as any).handleSessionReady({
      type: "session_ready",
      platformUrl: "http://test",
      sessions: [
        {
          sessionId: "s-no-branch",
          fossilUrl: "http://localhost:8000/",
          agentWorkspaceUser: "dev",
          agentWorkspacePassword: "pw",
          agentSubpath: null,
          branch: null,
          chatThreads: [],
        },
      ],
    });

    const openCmd = commandsRun.find(
      (c) => c[0] === "fossil" && c[1] === "open",
    );
    expect(openCmd).toBeDefined();
    // No branch arg should be appended.
    expect(openCmd!.length).toBe(4); // fossil, open, --nosync, repoPath
  });

  // Regression: a user_message arriving while session_ready is still in flight
  // (e.g., fossil clone running) must wait for the bootstrap to finish, not
  // emit "Error: No ACP connection for session: ..." immediately.
  it("user_message arriving mid-bootstrap waits for session_ready instead of erroring", async () => {
    const { MimoAgent } = await import("../src/index.js");
    const { deps } = buildMockDeps();

    let registeredSession: any = null;
    deps.sessionManager.getSession = ((id: string) =>
      registeredSession && registeredSession.sessionId === id
        ? registeredSession
        : undefined) as any;
    deps.sessionManager.createSession = (async (
      sessionId: string,
      fossilUrl: string,
    ) => {
      registeredSession = {
        sessionId,
        checkoutPath: "/tmp/work/" + sessionId,
        fossilUrl,
        acpProcess: null,
      };
      return registeredSession;
    }) as any;

    // Make setupCheckout's fossil work async so user_message races it.
    let resolveFossil: () => void;
    const fossilPromise = new Promise<void>((resolve) => {
      resolveFossil = resolve;
    });
    deps.os.fs.exists = (async () => false) as any;
    deps.os.fs.mkdir = (async () => {}) as any;
    deps.os.command.run = (async (args: string[]) => {
      if (args[0] === "fossil" && (args[1] === "clone" || args[1] === "open")) {
        await fossilPromise; // hold until user_message has started
      }
      return { success: true, output: "", error: "", exitCode: 0 };
    }) as any;

    const sentMessages: any[] = [];
    const agent = new MimoAgent(deps);
    (agent as any).ws = {
      send: (raw: string) => sentMessages.push(JSON.parse(raw)),
      readyState: 1,
    };

    // Force ensureThreadRuntime to succeed once a session is registered, so
    // we exercise the awaitSessionReady → spawn-success path rather than the
    // ACP machinery. Stub sendPrompt so the post-spawn flow doesn't trip on
    // the bare AcpClient mock.
    (agent as any).respawnAcpProcess = async (s: string) =>
      registeredSession && registeredSession.sessionId === s
        ? ({} as any)
        : null;
    (agent as any).sendPrompt = async () => {};

    // Kick off session_ready (slow) and user_message in parallel, with the
    // user_message starting before session_ready has finished cloning.
    const sessionReadyPromise = (agent as any).handleSessionReady({
      type: "session_ready",
      platformUrl: "http://test",
      sessions: [
        {
          sessionId: "s-race",
          fossilUrl: "http://localhost:8000/",
          agentWorkspaceUser: "dev",
          agentWorkspacePassword: "pw",
          agentSubpath: null,
          branch: null,
          chatThreads: [],
        },
      ],
    });

    // Yield once so handleSessionReady has registered pendingSessionReady.
    await Promise.resolve();

    const userMessagePromise = (agent as any).handleUserMessage({
      type: "user_message",
      sessionId: "s-race",
      chatThreadId: "t-race",
      content: "hello",
    });

    // Now let the fossil operations complete
    resolveFossil!();

    await Promise.all([sessionReadyPromise, userMessagePromise]);

    const errorResp = sentMessages.find(
      (m) =>
        m.type === "error_response" &&
        typeof m.error === "string" &&
        m.error.includes("No ACP connection"),
    );
    expect(errorResp).toBeUndefined();
  });

  // Regression: request_state arriving before the session exists must not
  // leave the thread stuck in "initializing". The real bug we hit:
  // handleRequestState pre-set state to "initializing" before calling
  // ensureThreadRuntime; if the session was missing, the state stayed
  // "initializing" forever and any later user_message queued indefinitely.
  it("request_state for unknown session does not leave thread in initializing", async () => {
    const { MimoAgent } = await import("../src/index.js");

    const { deps, acpClients, lifecycleStates } = buildMockDeps({
      getThreadState: (s: string, t: string) =>
        lifecycleStates.get(`${s}:${t}`) ?? "active",
      setThreadState: (s: string, t: string, state: string) =>
        lifecycleStates.set(`${s}:${t}`, state),
    });

    // Session does not yet exist when request_state arrives.
    deps.sessionManager.getSession = (() => undefined) as any;

    const agent = new MimoAgent(deps);
    (agent as any).ws = { send: () => {}, readyState: 1 };
    (agent as any).acpClients = acpClients;

    await (agent as any).handleRequestState({
      type: "request_state",
      sessionId: "s1",
      chatThreadId: "t1",
    });
    // Give the void'd ensureThreadRuntime time to settle.
    await waitFor(() => lifecycleStates.get("s1:t1") !== "initializing", {
      timeout: 1000,
    });

    // Thread state must NOT be stuck in "initializing" — otherwise a later
    // user_message would queue forever.
    expect(lifecycleStates.get("s1:t1") ?? "active").not.toBe("initializing");
  });
});
