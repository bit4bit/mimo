// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, beforeEach } from "bun:test";
import { createMcpRoutes } from "../src/api/mcp/server.js";
import { mcpTokenStore } from "../src/mcp/token-store.js";

const TOKEN = "test-token-create-thread";
const SESSION_ID = "session-1";
const CALLER_THREAD_ID = "thread-caller";

function makeCallerThread() {
  return {
    id: CALLER_THREAD_ID,
    name: "Caller",
    model: "opus",
    mode: "code",
    acpSessionId: "acp-1",
    assignedAgentId: "agent-X",
    state: "active" as const,
    brainWash: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    owner: "alice",
    assignedAgentId: "agent-session",
    chatThreads: [makeCallerThread()],
    modelState: {
      currentModelId: "opus",
      availableModels: [{ value: "opus", name: "Opus" }],
    },
    modeState: {
      currentModeId: "code",
      availableModes: [{ value: "code", name: "Code" }],
    },
    ...overrides,
  };
}

function makeContext(session: any, agentsOverride?: any[]) {
  const sent: any[] = [];
  const added: any[] = [];
  const broadcasts: any[] = [];
  const wsClient = {
    readyState: 1,
    send: (msg: string) => broadcasts.push(JSON.parse(msg)),
  };
  const chatSessions = new Map([[SESSION_ID, new Set([wsClient])]]);
  const ctx = {
    chatSessions,
    getSessionWorkspace: async () => "/tmp/ws",
    fileService: {} as any,
    sessionRepository: {
      findById: async (id: string) => (id === SESSION_ID ? session : null),
      addChatThread: async (sessionId: string, thread: any) => {
        const created = {
          id: "thread-new",
          createdAt: "2026-01-02T00:00:00.000Z",
          ...thread,
        };
        added.push(created);
        session.chatThreads.push(created);
        return created;
      },
    },
    agentService: {
      sendToAgent: async (agentId: string, message: unknown) => {
        sent.push({ agentId, message });
        return true;
      },
      listAgentsByOwner: async () =>
        agentsOverride ?? [
          {
            id: "agent-X",
            name: "Builder",
            capabilities: {
              availableModels: [{ value: "opus", name: "Opus" }],
              defaultModelId: "opus",
              availableModes: [{ value: "code", name: "Code" }],
              defaultModeId: "code",
            },
          },
          { id: "agent-Y", name: "Reviewer" },
        ],
    },
  };
  return { ctx, sent, added, broadcasts };
}

function call(
  router: ReturnType<typeof createMcpRoutes>,
  toolArgs: unknown,
  headers: Record<string, string> = {},
) {
  return router.request("/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "create_chat_thread", arguments: toolArgs },
    }),
  });
}

describe("MCP create_chat_thread", () => {
  beforeEach(() => {
    mcpTokenStore.register(TOKEN, SESSION_ID);
  });

  it("spawns a thread inheriting caller model/mode/agent and seeds initial_prompt", async () => {
    const { ctx, sent, added, broadcasts } = makeContext(makeSession());
    const router = createMcpRoutes(ctx as any);

    const res = await call(
      router,
      { initialPrompt: "Refactor the auth middleware" },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    const json = await res.json();

    expect(json.result.success).toBe(true);
    expect(json.result.threadId).toBe("thread-new");
    expect(json.result.name).toBe("Refactor the auth");

    // Inherited
    expect(added[0].model).toBe("opus");
    expect(added[0].mode).toBe("code");
    expect(added[0].assignedAgentId).toBe("agent-X");
    expect(added[0].acpSessionId).toBeNull();
    expect(added[0].state).toBe("active");

    // Seeded as initial_prompt to the inherited agent
    expect(sent).toHaveLength(1);
    expect(sent[0].agentId).toBe("agent-X");
    expect(sent[0].message).toMatchObject({
      type: "initial_prompt",
      sessionId: SESSION_ID,
      chatThreadId: "thread-new",
      content: "Refactor the auth middleware",
    });

    // Live UI surfacing: broadcast chat_thread_created to the session's clients
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]).toMatchObject({
      type: "chat_thread_created",
      sessionId: SESSION_ID,
      thread: { id: "thread-new", name: "Refactor the auth" },
    });
  });

  it("broadcasts a failure event (not chat_thread_created) when creation fails", async () => {
    const { ctx, broadcasts } = makeContext(makeSession());
    const router = createMcpRoutes(ctx as any);

    const res = await call(router, { initialPrompt: "x" });
    const json = await res.json();
    expect(json.result.success).toBe(false);
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]).toMatchObject({
      type: "chat_thread_create_failed",
      sessionId: SESSION_ID,
      error: "Missing X-Mimo-Thread-Id header",
    });
  });

  it("applies explicit overrides that are valid for the target agent", async () => {
    const session = makeSession();
    const { ctx, added } = makeContext(session, [
      {
        id: "agent-Z",
        name: "Z",
        capabilities: {
          availableModels: [
            { value: "sonnet", name: "Sonnet" },
            { value: "haiku", name: "Haiku" },
          ],
          defaultModelId: "haiku",
          availableModes: [{ value: "plan", name: "Plan" }],
          defaultModeId: "plan",
        },
      },
    ]);
    const router = createMcpRoutes(ctx as any);

    await call(
      router,
      {
        initialPrompt: "Try sonnet",
        model: "sonnet",
        mode: "plan",
        assignedAgentId: "agent-Z",
      },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );

    expect(added[0].model).toBe("sonnet");
    expect(added[0].mode).toBe("plan");
    expect(added[0].assignedAgentId).toBe("agent-Z");
  });

  it("errors (and creates nothing) when the requested model is invalid for the agent", async () => {
    const session = makeSession();
    const { ctx, added, sent, broadcasts } = makeContext(session, [
      {
        id: "agent-Z",
        name: "Z",
        capabilities: {
          availableModels: [{ value: "haiku", name: "Haiku" }],
          defaultModelId: "haiku",
          availableModes: [{ value: "plan", name: "Plan" }],
          defaultModeId: "plan",
        },
      },
    ]);
    const router = createMcpRoutes(ctx as any);

    const res = await call(
      router,
      {
        initialPrompt: "Bogus model",
        model: "gpt-9000",
        assignedAgentId: "agent-Z",
      },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    const json = await res.json();

    expect(json.result.success).toBe(false);
    expect(json.result.error).toContain("Invalid model 'gpt-9000'");
    expect(json.result.error).toContain("haiku");
    expect(added).toHaveLength(0);
    expect(sent).toHaveLength(0);
    // No thread-created broadcast, but a failure broadcast so the UI shows it.
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].type).toBe("chat_thread_create_failed");
  });

  it("resolves an agent override given by name (not id) and validates against it", async () => {
    const session = makeSession();
    const { ctx, added } = makeContext(session, [
      {
        id: "agent-real-id",
        name: "opencode",
        capabilities: {
          availableModels: [{ value: "Ollama Cloud/glm-4.1", name: "GLM" }],
          defaultModelId: "Ollama Cloud/glm-4.1",
          availableModes: [{ value: "code", name: "Code" }],
          defaultModeId: "code",
        },
      },
    ]);
    const router = createMcpRoutes(ctx as any);

    // Wrong short model "glm" → error that lists the real value so the LLM can search
    const bad = await call(
      router,
      { initialPrompt: "count 2 to 6", model: "glm", assignedAgentId: "opencode" },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    const badJson = await bad.json();
    expect(badJson.result.success).toBe(false);
    expect(badJson.result.error).toContain("Invalid model 'glm'");
    // Suggests the close match rather than dumping every model
    expect(badJson.result.error).toContain("Did you mean:");
    expect(badJson.result.error).toContain("Ollama Cloud/glm-4.1");
    expect(added).toHaveLength(0);

    // Correct full model id with the agent named → resolves to the agent's real id
    const ok = await call(
      router,
      {
        initialPrompt: "count 2 to 6",
        model: "Ollama Cloud/glm-4.1",
        mode: "code",
        assignedAgentId: "opencode",
      },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    const okJson = await ok.json();
    expect(okJson.result.success).toBe(true);
    expect(added[0].assignedAgentId).toBe("agent-real-id");
    expect(added[0].model).toBe("Ollama Cloud/glm-4.1");
  });

  it("ranks multiple close model matches in the suggestion", async () => {
    const session = makeSession();
    const { ctx } = makeContext(session, [
      {
        id: "agent-multi",
        name: "multi",
        capabilities: {
          availableModels: [
            { value: "Ollama Cloud/glm-4.1", name: "GLM 4.1" },
            { value: "Ollama Cloud/glm-4.1-air", name: "GLM 4.1 Air" },
            { value: "anthropic/claude", name: "Claude" },
          ],
          defaultModelId: "anthropic/claude",
          availableModes: [{ value: "code", name: "Code" }],
          defaultModeId: "code",
        },
      },
    ]);
    const router = createMcpRoutes(ctx as any);

    const res = await call(
      router,
      { initialPrompt: "x", model: "glm", assignedAgentId: "multi" },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    const json = await res.json();
    expect(json.result.error).toContain("Did you mean:");
    expect(json.result.error).toContain("Ollama Cloud/glm-4.1");
    expect(json.result.error).toContain("Ollama Cloud/glm-4.1-air");
    // The unrelated model is not suggested
    expect(json.result.error).not.toContain("anthropic/claude");
  });

  it("errors when an explicit agent cannot be resolved", async () => {
    const session = makeSession();
    const { ctx, added } = makeContext(session, [
      { id: "agent-real-id", name: "opencode" },
    ]);
    const router = createMcpRoutes(ctx as any);

    const res = await call(
      router,
      { initialPrompt: "x", assignedAgentId: "ghost-agent" },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    const json = await res.json();
    expect(json.result.success).toBe(false);
    expect(json.result.error).toContain("Invalid agent 'ghost-agent'");
    expect(json.result.error).toContain("opencode");
    expect(added).toHaveLength(0);
  });

  it("errors when the requested mode is invalid for the agent", async () => {
    const session = makeSession();
    const { ctx, added } = makeContext(session, [
      {
        id: "agent-Z",
        name: "Z",
        capabilities: {
          availableModels: [{ value: "haiku", name: "Haiku" }],
          defaultModelId: "haiku",
          availableModes: [{ value: "plan", name: "Plan" }],
          defaultModeId: "plan",
        },
      },
    ]);
    const router = createMcpRoutes(ctx as any);

    const res = await call(
      router,
      {
        initialPrompt: "x",
        model: "haiku",
        mode: "nonsense",
        assignedAgentId: "agent-Z",
      },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    const json = await res.json();

    expect(json.result.success).toBe(false);
    expect(json.result.error).toContain("Invalid mode 'nonsense'");
    expect(added).toHaveLength(0);
  });

  it("passes the model through when the agent advertises no capabilities", async () => {
    const session = makeSession();
    const { ctx, added } = makeContext(session, [
      { id: "agent-Z", name: "Z" },
    ]);
    const router = createMcpRoutes(ctx as any);

    await call(
      router,
      { initialPrompt: "x", model: "anything", assignedAgentId: "agent-Z" },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    expect(added[0].model).toBe("anything");
  });

  it("uses an explicit title when provided", async () => {
    const { ctx, added } = makeContext(makeSession());
    const router = createMcpRoutes(ctx as any);

    await call(
      router,
      { initialPrompt: "do a big refactor of everything", title: "Auth cleanup" },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    expect(added[0].name).toBe("Auth cleanup");
  });

  it("char-limits a long explicit title", async () => {
    const { ctx, added } = makeContext(makeSession());
    const router = createMcpRoutes(ctx as any);

    await call(
      router,
      {
        initialPrompt: "x",
        title: "An extremely long thread title that should be shortened",
      },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    expect(added[0].name.length).toBeLessThanOrEqual(24);
    expect(added[0].name).toBe("An extremely long thread");
  });

  it("auto-dedupes the generated name within the session", async () => {
    const session = makeSession();
    session.chatThreads.push({ ...makeCallerThread(), id: "t2", name: "Fix bug" });
    const { ctx, added } = makeContext(session);
    const router = createMcpRoutes(ctx as any);

    await call(
      router,
      { initialPrompt: "Fix bug" },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    expect(added[0].name).toBe("Fix bug (2)");
  });

  it("errors without X-Mimo-Thread-Id and creates nothing", async () => {
    const { ctx, added, sent } = makeContext(makeSession());
    const router = createMcpRoutes(ctx as any);

    const res = await call(router, { initialPrompt: "x" });
    const json = await res.json();
    expect(json.result.success).toBe(false);
    expect(added).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("errors when caller thread is not in the session", async () => {
    const { ctx, added } = makeContext(makeSession());
    const router = createMcpRoutes(ctx as any);

    const res = await call(
      router,
      { initialPrompt: "x" },
      { "X-Mimo-Thread-Id": "ghost" },
    );
    const json = await res.json();
    expect(json.result.success).toBe(false);
    expect(added).toHaveLength(0);
  });

  it("errors on missing initialPrompt", async () => {
    const { ctx, added } = makeContext(makeSession());
    const router = createMcpRoutes(ctx as any);

    const res = await call(
      router,
      { initialPrompt: "   " },
      { "X-Mimo-Thread-Id": CALLER_THREAD_ID },
    );
    const json = await res.json();
    expect(json.result.success).toBe(false);
    expect(added).toHaveLength(0);
  });
});

describe("MCP list_thread_options", () => {
  beforeEach(() => {
    mcpTokenStore.register(TOKEN, SESSION_ID);
  });

  it("returns available agents, models, and modes", async () => {
    const { ctx } = makeContext(makeSession());
    const router = createMcpRoutes(ctx as any);

    const res = await router.request("/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_thread_options", arguments: {} },
      }),
    });
    const json = await res.json();

    expect(json.result.success).toBe(true);
    // Per-agent valid models/modes so the caller can pick a valid pairing.
    expect(json.result.agents).toEqual([
      {
        id: "agent-X",
        name: "Builder",
        models: [{ value: "opus", name: "Opus" }],
        modes: [{ value: "code", name: "Code" }],
        defaultModelId: "opus",
        defaultModeId: "code",
      },
      {
        id: "agent-Y",
        name: "Reviewer",
        models: [],
        modes: [],
        defaultModelId: null,
        defaultModeId: null,
      },
    ]);
    expect(json.result.models).toEqual([{ value: "opus", name: "Opus" }]);
    expect(json.result.modes).toEqual([{ value: "code", name: "Code" }]);
  });
});

describe("MCP tools/list", () => {
  beforeEach(() => {
    mcpTokenStore.register(TOKEN, SESSION_ID);
  });

  it("advertises create_chat_thread and list_thread_options", async () => {
    const { ctx } = makeContext(makeSession());
    const router = createMcpRoutes(ctx as any);

    const res = await router.request("/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
      }),
    });
    const json = await res.json();
    const names = json.result.tools.map((t: any) => t.name);
    expect(names).toContain("create_chat_thread");
    expect(names).toContain("list_thread_options");
    expect(names).toContain("open_file");
  });
});
