import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { dump } from "js-yaml";

import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

function seedAgent(home: string, id: string, owner: string) {
  const dir = join(home, "agents", id);
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    join(dir, "agent.yaml"),
    dump({
      id,
      name: id,
      owner,
      token: "seed-token",
      sessionIds: [],
      status: "offline",
      provider: "opencode",
      startedAt: now,
      updatedAt: now,
      sharedWith: [],
    }),
    { encoding: "utf-8" },
  );
}

let testHome: string;
let mimoContext: any;
let sessionRepository: any;
let projectRepository: any;
let userRepository: any;
let authService: any;
let agentService: any;

function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");

  const app = new Hono();
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

  const sessions = createSessionsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const path = new URL(urlStr).pathname;
        return app.request(path, init);
      }
      return fetch(url, init);
    },
  });
  app.route("/projects/:projectId/sessions", sessions);

  return app;
}

describe("Terminal platform↔agent protocol", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-terminal-ws-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "test-secret",
        PLATFORM_URL: "http://localhost:3000",
      },
      services: { sharedVcs: new DummyGitHttpServer() },
    });

    mimoContext = ctx;
    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;
    authService = ctx.services.auth;
    agentService = ctx.services.agents;

    ctx.services.vcs.cloneRepository = async () => ({ success: true });
    ctx.services.vcs.importToFossil = async () => ({ success: true });
    ctx.services.vcs.seedSessionRepo = async () => ({ success: true });
    ctx.services.vcs.clonePlatformCheckout = async () => ({ success: true });
    ctx.services.vcs.syncIgnoresToGit = async () => ({ success: true });
    ctx.services.vcs.openFossilCheckout = async () => ({ success: true });
    ctx.services.vcs.openFossil = async () => ({ success: true });
    ctx.services.vcs.syncIgnoresToFossil = async () => ({ success: true });
  });

  afterEach(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  async function createUserProjectSession() {
    const app = createTestApp(mimoContext);

    await userRepository.create(
      "owner",
      await Bun.password.hash("pass", { algorithm: "bcrypt", cost: 10 }),
    );
    const token = await authService.generateToken("owner");

    const project = await projectRepository.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "owner",
    });

    const session = await sessionRepository.create({
      name: "Test Session",
      projectId: project.id,
      owner: "owner",
    });

    seedAgent(testHome, "agent-01", "owner");

    const sentMessages: any[] = [];
    const mockWs = {
      readyState: 1,
      send: (data: string) => {
        sentMessages.push(JSON.parse(data));
      },
    };
    agentService.activeConnections.set("agent-01", mockWs);
    agentService.isAgentOnline = () => true;

    return { app, project, session, token, sentMessages };
  }

  function authHeaders(token: string) {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  it("creating a terminal sends terminal_spawn message to the assigned agent", async () => {
    const { app, session, token, sentMessages } = await createUserProjectSession();

    const res = await app.request(
      `/api/internal/sessions/${session.id}/terminals`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          name: "build-shell",
          assignedAgentId: "agent-01",
          scrollback: 5000,
          subpath: "packages/backend",
        }),
      },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    const terminalId = body.data.terminal.id;

    const spawnMsg = sentMessages.find((m) => m.type === "terminal_spawn");
    expect(spawnMsg).toBeDefined();
    expect(spawnMsg.sessionId).toBe(session.id);
    expect(spawnMsg.terminalId).toBe(terminalId);
    expect(spawnMsg.subpath).toBe("packages/backend");
    expect(spawnMsg.scrollback).toBe(5000);
  });

  it("creating a terminal with cols/rows includes them in terminal_spawn", async () => {
    const { app, session, token, sentMessages } = await createUserProjectSession();

    const res = await app.request(
      `/api/internal/sessions/${session.id}/terminals`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          name: "sized-shell",
          assignedAgentId: "agent-01",
          scrollback: 1000,
          cols: 132,
          rows: 43,
        }),
      },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.terminal.cols).toBe(132);
    expect(body.data.terminal.rows).toBe(43);

    const spawnMsg = sentMessages.find((m) => m.type === "terminal_spawn");
    expect(spawnMsg).toBeDefined();
    expect(spawnMsg.cols).toBe(132);
    expect(spawnMsg.rows).toBe(43);
  });

  it("creating a terminal without cols/rows defaults to 80x24 in terminal_spawn", async () => {
    const { app, session, token, sentMessages } = await createUserProjectSession();

    const res = await app.request(
      `/api/internal/sessions/${session.id}/terminals`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          name: "default-shell",
          assignedAgentId: "agent-01",
          scrollback: 1000,
        }),
      },
    );

    expect(res.status).toBe(201);

    const spawnMsg = sentMessages.find((m) => m.type === "terminal_spawn");
    expect(spawnMsg).toBeDefined();
    expect(spawnMsg.cols).toBe(80);
    expect(spawnMsg.rows).toBe(24);
  });

  it("creating a terminal with invalid cols/rows returns 400", async () => {
    const { app, session, token } = await createUserProjectSession();

    const res = await app.request(
      `/api/internal/sessions/${session.id}/terminals`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          name: "bad-shell",
          assignedAgentId: "agent-01",
          scrollback: 1000,
          cols: 0,
          rows: -5,
        }),
      },
    );

    expect(res.status).toBe(400);
  });

  it("deleting a terminal sends terminal_kill message to the assigned agent", async () => {
    const { app, session, token, sentMessages } = await createUserProjectSession();

    const createRes = await app.request(
      `/api/internal/sessions/${session.id}/terminals`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          name: "to-delete",
          assignedAgentId: "agent-01",
          scrollback: 1000,
        }),
      },
    );
    const created = await createRes.json();
    const terminalId = created.data.terminal.id;

    sentMessages.length = 0;

    await app.request(
      `/api/internal/sessions/${session.id}/terminals/${terminalId}`,
      {
        method: "DELETE",
        headers: authHeaders(token),
      },
    );

    const killMsg = sentMessages.find((m) => m.type === "terminal_kill");
    expect(killMsg).toBeDefined();
    expect(killMsg.sessionId).toBe(session.id);
    expect(killMsg.terminalId).toBe(terminalId);
  });

  it("message-router handles terminal_output", async () => {
    const { AgentMessageRouter } = await import(
      "../src/domain/agents/message-router.ts"
    );

    const broadcastMessages: any[] = [];
    const router = new AgentMessageRouter({
      agentService,
      sessionRepository,
      pipeline: {} as any,
      chatSessions: new Map(),
      broadcast: (_sessionId: string, message: any) => {
        broadcastMessages.push(message);
      },
    } as any);

    let error: any = null;
    try {
      await router.handle("agent-01", { send: () => {} } as any, {
        type: "terminal_output",
        sessionId: "test-session",
        terminalId: "test-terminal",
        data: "aGVsbG8=",
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeNull();
    expect(broadcastMessages.length).toBe(1);
    expect(broadcastMessages[0].type).toBe("terminal_output");
    expect(broadcastMessages[0].terminalId).toBe("test-terminal");
  });

  it("message-router handles terminal_exited", async () => {
    const session = await sessionRepository.create({
      name: "Exit Test",
      projectId: "test-project",
      owner: "owner",
    });
    const terminal = await sessionRepository.addTerminal(session.id, {
      name: "exiting",
      assignedAgentId: "agent-01",
      scrollback: 1000,
    });

    const { AgentMessageRouter } = await import(
      "../src/domain/agents/message-router.ts"
    );

    const broadcastMessages: any[] = [];
    const router = new AgentMessageRouter({
      agentService,
      sessionRepository,
      pipeline: {} as any,
      chatSessions: new Map(),
      broadcast: (_sessionId: string, message: any) => {
        broadcastMessages.push(message);
      },
    } as any);

    let error: any = null;
    try {
      await router.handle("agent-01", { send: () => {} } as any, {
        type: "terminal_exited",
        sessionId: session.id,
        terminalId: terminal.id,
        exitCode: 0,
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeNull();

    const updated = await sessionRepository.findById(session.id);
    const updatedTerminal = updated!.terminals.find(
      (t: any) => t.id === terminal.id,
    );
    expect(updatedTerminal.state).toBe("dead");

    expect(broadcastMessages.length).toBe(1);
    expect(broadcastMessages[0].type).toBe("terminal_exited");
    expect(broadcastMessages[0].terminalId).toBe(terminal.id);
  });
});