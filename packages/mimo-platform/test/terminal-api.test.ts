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
  const app = new Hono();
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);
  return app;
}

function createInternalTokenApp(ctx: any): Hono {
  const app = createTestApp(ctx);
  return app;
}

describe("Terminal Internal API", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-terminal-api-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    const app = createInternalTokenApp(mimoContext);

    await userRepository.create(
      "owner",
      await Bun.password.hash("pass", { algorithm: "bcrypt", cost: 10 }),
    );
    const token = await authService.generateToken("owner");

    const project = await projectRepository.create({
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/user/repo.git",
          repoType: "git",
          mountPath: ".",
        },
      ],

      name: "Test Project",
      owner: "owner",
    });

    const session = await sessionRepository.create({
      name: "Test Session",
      projectId: project.id,
      owner: "owner",
    });

    seedAgent(testHome, "agent-01", "owner");

    agentService.isAgentOnline = () => true;

    return { app, project, session, token };
  }

  function authHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  describe("POST /sessions/:id/terminals", () => {
    it("creates a terminal and returns it", async () => {
      const { app, session, token } = await createUserProjectSession();

      const res = await app.request(
        `/api/internal/sessions/${session.id}/terminals`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({
            name: "build-shell",
            assignedAgentId: "agent-01",
            scrollback: 5000,
          }),
        },
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.terminal.name).toBe("build-shell");
      expect(body.data.terminal.assignedAgentId).toBe("agent-01");
      expect(body.data.terminal.command).toBe("/bin/sh");
      expect(body.data.terminal.scrollback).toBe(5000);
      expect(body.data.terminal.state).toBe("active");
      expect(body.data.terminal.id).toBeDefined();
    });

    it("returns 400 when name is missing", async () => {
      const { app, session, token } = await createUserProjectSession();

      const res = await app.request(
        `/api/internal/sessions/${session.id}/terminals`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({
            assignedAgentId: "agent-01",
            scrollback: 1000,
          }),
        },
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("returns 400 when assignedAgentId is missing", async () => {
      const { app, session, token } = await createUserProjectSession();

      const res = await app.request(
        `/api/internal/sessions/${session.id}/terminals`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({
            name: "shell",
            scrollback: 1000,
          }),
        },
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("returns 400 when the assigned agent is not online", async () => {
      const { app, session, token } = await createUserProjectSession();

      seedAgent(testHome, "agent-offline", "owner");
      agentService.isAgentOnline = (agentId: string) =>
        agentId !== "agent-offline";

      const res = await app.request(
        `/api/internal/sessions/${session.id}/terminals`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({
            name: "shell",
            assignedAgentId: "agent-offline",
            scrollback: 1000,
          }),
        },
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("creates a terminal with subpath", async () => {
      const { app, session, token } = await createUserProjectSession();

      const res = await app.request(
        `/api/internal/sessions/${session.id}/terminals`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({
            name: "backend-shell",
            assignedAgentId: "agent-01",
            scrollback: 1000,
            subpath: "packages/backend",
          }),
        },
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.terminal.subpath).toBe("packages/backend");
    });
  });

  describe("GET /sessions/:id/terminals", () => {
    it("returns the terminal list", async () => {
      const { app, session, token } = await createUserProjectSession();

      await app.request(`/api/internal/sessions/${session.id}/terminals`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          name: "term-1",
          assignedAgentId: "agent-01",
          scrollback: 1000,
        }),
      });

      const res = await app.request(
        `/api/internal/sessions/${session.id}/terminals`,
        {
          method: "GET",
          headers: authHeaders(token),
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.terminals).toHaveLength(1);
      expect(body.data.terminals[0].name).toBe("term-1");
    });
  });

  describe("DELETE /sessions/:id/terminals/:terminalId", () => {
    it("removes the terminal and returns 200", async () => {
      const { app, session, token } = await createUserProjectSession();

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

      const res = await app.request(
        `/api/internal/sessions/${session.id}/terminals/${terminalId}`,
        {
          method: "DELETE",
          headers: authHeaders(token),
        },
      );

      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent terminal", async () => {
      const { app, session, token } = await createUserProjectSession();

      const res = await app.request(
        `/api/internal/sessions/${session.id}/terminals/non-existent`,
        {
          method: "DELETE",
          headers: authHeaders(token),
        },
      );

      expect(res.status).toBe(404);
    });
  });
});
