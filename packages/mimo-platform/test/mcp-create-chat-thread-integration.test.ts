// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SessionRepository } from "../src/domain/sessions/repository.js";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { createMcpRoutes } from "../src/api/mcp/server.js";
import { mcpTokenStore } from "../src/mcp/token-store.js";

describe("create_chat_thread (integration, real SessionRepository)", () => {
  let basePath: string;
  let sessions: SessionRepository;

  beforeEach(() => {
    const os = createOS(process.env as Record<string, string>);
    basePath = mkdtempSync(join(tmpdir(), "mimo-mcp-spawn-"));
    mkdirSync(join(basePath, "projects"), { recursive: true });
    sessions = new SessionRepository({
      paths: { projects: join(basePath, "projects"), data: basePath },
      fossilReposDir: join(basePath, "session-fossils"),
      os,
    });
  });

  afterEach(() => {
    if (existsSync(basePath)) rmSync(basePath, { recursive: true, force: true });
  });

  it("persists a new thread inheriting the caller and dispatches initial_prompt", async () => {
    const session = await sessions.create({
      name: "S",
      projectId: "p",
      owner: "alice",
    });
    const caller = await sessions.addChatThread(session.id, {
      name: "Caller",
      model: "opus",
      mode: "code",
      acpSessionId: "acp-1",
      assignedAgentId: "agent-X",
      state: "active",
      brainWash: false,
    });

    mcpTokenStore.register("tok-int", session.id);

    const sent: any[] = [];
    const router = createMcpRoutes({
      chatSessions: new Map(),
      getSessionWorkspace: async () => "/tmp/ws",
      fileService: {} as any,
      sessionRepository: sessions,
      agentService: {
        sendToAgent: async (agentId: string, message: unknown) => {
          sent.push({ agentId, message });
          return true;
        },
        listAgentsByOwner: async () => [],
      } as any,
    });

    const res = await router.request("/", {
      method: "POST",
      headers: {
        Authorization: "Bearer tok-int",
        "Content-Type": "application/json",
        "X-Mimo-Thread-Id": caller.id,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "create_chat_thread",
          arguments: { initialPrompt: "Run the migration in parallel" },
        },
      }),
    });
    const json = await res.json();
    expect(json.result.success).toBe(true);

    // Persisted in the real repository
    const reloaded = await sessions.findById(session.id);
    const created = reloaded!.chatThreads.find((t) => t.id === json.result.threadId);
    expect(created).toBeDefined();
    expect(created!.name).toBe("Run the migration in");
    expect(created!.model).toBe("opus");
    expect(created!.mode).toBe("code");
    expect(created!.assignedAgentId).toBe("agent-X");
    expect(created!.acpSessionId).toBeNull();
    expect(created!.state).toBe("active");

    // Agent received the seed prompt that self-warms the runtime
    expect(sent).toHaveLength(1);
    expect(sent[0].agentId).toBe("agent-X");
    expect(sent[0].message).toMatchObject({
      type: "initial_prompt",
      sessionId: session.id,
      chatThreadId: created!.id,
      content: "Run the migration in parallel",
    });
  });
});
