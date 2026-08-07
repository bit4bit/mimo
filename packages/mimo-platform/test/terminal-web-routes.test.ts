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

describe("Terminal Web Route Proxies", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-terminal-web-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

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

  describe("POST /:id/terminals (web route)", () => {
    it("proxies to internal API and returns the created terminal", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/terminals`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "build-shell",
            assignedAgentId: "agent-01",
            scrollback: 5000,
          }),
        },
      );

      expect(res.status).toBe(201);
      const terminal = await res.json();
      expect(terminal.name).toBe("build-shell");
      expect(terminal.assignedAgentId).toBe("agent-01");
      expect(terminal.scrollback).toBe(5000);
    });
  });

  describe("GET /:id/terminals (web route)", () => {
    it("returns terminals for the session", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      await app.request(
        `/projects/${project.id}/sessions/${session.id}/terminals`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "term-1",
            assignedAgentId: "agent-01",
            scrollback: 1000,
          }),
        },
      );

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/terminals`,
        {
          method: "GET",
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.terminals).toHaveLength(1);
      expect(body.terminals[0].name).toBe("term-1");
    });
  });

  describe("DELETE /:id/terminals/:terminalId (web route)", () => {
    it("proxies to internal API and returns success", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const createRes = await app.request(
        `/projects/${project.id}/sessions/${session.id}/terminals`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "to-delete",
            assignedAgentId: "agent-01",
            scrollback: 1000,
          }),
        },
      );
      const terminal = await createRes.json();
      const terminalId = terminal.id;

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/terminals/${terminalId}`,
        {
          method: "DELETE",
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(200);
    });
  });
});
