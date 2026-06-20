import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { dump } from "js-yaml";

import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

let sessionRepository: any;
let userRepository: any;
let projectRepository: any;
let authService: any;
let testHome: string;
let mimoContext: any;

// Helper to create test app with internal API mounted
function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");

  const app = new Hono();

  // Mount internal API
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

  // Mount session routes with fetchFn that routes through app
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
  app.route("/sessions", sessions);

  return app;
}

describe("Session Priority", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-priority-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
      services: { sharedVcs: new DummyGitHttpServer() },
    });

    mimoContext = ctx;
    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;
    authService = ctx.services.auth;

    ctx.services.vcs.cloneRepository = async () => ({ success: true });
    ctx.services.vcs.importToFossil = async () => ({ success: true });
    ctx.services.vcs.seedSessionRepo = async () => ({ success: true });
    ctx.services.vcs.clonePlatformCheckout = async () => ({ success: true });
    ctx.services.vcs.syncIgnoresToGit = async () => ({ success: true });
    ctx.services.vcs.openFossilCheckout = async () => ({ success: true });
    ctx.services.vcs.openFossil = async () => ({ success: true });
    ctx.services.vcs.syncIgnoresToFossil = async () => ({ success: true });
    ctx.services.vcs.createFossilUser = async () => ({ success: true });
  });

  async function createUser(username = "testuser") {
    await userRepository.create(
      username,
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
    );
    return authService.generateToken(username);
  }

  async function createProject(owner = "testuser") {
    return projectRepository.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner,
    });
  }

  describe("6.1 — create session with priority: high stores and returns it", () => {
    it("should store and return priority: high when specified at creation", async () => {
      const app = createTestApp(mimoContext);

      const token = await createUser();
      const project = await createProject();

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "High Priority Session",
          priority: "high",
        }).toString(),
      });

      expect(res.status).toBe(302);

      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(1);
      expect(sessions[0].priority).toBe("high");
    });
  });

  describe("6.2 — create session without priority defaults to medium", () => {
    it("should default to medium when priority not provided", async () => {
      const app = createTestApp(mimoContext);

      const token = await createUser();
      const project = await createProject();

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Default Priority Session",
        }).toString(),
      });

      expect(res.status).toBe(302);

      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(1);
      expect(sessions[0].priority).toBe("medium");
    });
  });

  describe("6.3 — POST with invalid priority returns 400", () => {
    it("should return 400 when priority is not a valid value", async () => {
      const app = createTestApp(mimoContext);

      const token = await createUser();
      const project = await createProject();

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Bad Priority Session",
          priority: "urgent",
        }).toString(),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("6.4 — PATCH config with priority: low persists it", () => {
    it("should persist updated priority via PATCH config", async () => {
      const app = createTestApp(mimoContext);

      const token = await createUser();
      const project = await createProject();

      const createRes = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Session To Update" }).toString(),
      });

      const location = createRes.headers.get("location") || "";
      const sessionId = location.split("/").pop();

      const patchRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/config`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ priority: "low" }),
        },
      );

      expect(patchRes.status).toBe(200);

      const updated = await sessionRepository.findById(sessionId!);
      expect(updated?.priority).toBe("low");
    });
  });

  describe("6.5 — session.yaml missing priority field reads as medium", () => {
    it("should coerce missing priority to medium on read", async () => {
      const token = await createUser();
      const project = await createProject();

      // Manually write a session.yaml without priority field
      const sessionId = "legacy-session-no-priority";
      const sessionsDir = join(
        testHome,
        "projects",
        project.id,
        "sessions",
        sessionId,
      );
      mkdirSync(sessionsDir, { recursive: true });

      const now = new Date().toISOString();
      const legacyData = {
        id: sessionId,
        name: "Legacy Session",
        projectId: project.id,
        owner: "testuser",
        upstreamPath: join(sessionsDir, "upstream"),
        agentWorkspacePath: join(sessionsDir, "agent-workspace"),
        status: "active",
        port: null,
        mcpServerIds: [],
        idleTimeoutMs: 600000,
        acpStatus: "active",
        syncState: "idle",
        chatThreads: [],
        activeChatThreadId: null,
        createdAt: now,
        updatedAt: now,
        // NOTE: no priority field
      };

      writeFileSync(
        join(sessionsDir, "session.yaml"),
        dump(legacyData),
        "utf-8",
      );

      const session = await sessionRepository.findById(sessionId);
      expect(session).not.toBeNull();
      expect(session?.priority).toBe("medium");
    });
  });

  describe("6.6 — list returns high before medium before low regardless of creation order", () => {
    it("should sort sessions high → medium → low", async () => {
      const app = createTestApp(mimoContext);

      const token = await createUser();
      const project = await createProject();

      // Create in order: medium, low, high
      for (const [name, priority] of [
        ["Medium Session", "medium"],
        ["Low Session", "low"],
        ["High Session", "high"],
      ]) {
        const res = await app.request(`/projects/${project.id}/sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `token=${token}`,
          },
          body: new URLSearchParams({
            name,
            priority: priority as string,
          }).toString(),
        });
        expect(res.status).toBe(302);
      }

      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(3);
      expect(sessions[0].priority).toBe("high");
      expect(sessions[1].priority).toBe("medium");
      expect(sessions[2].priority).toBe("low");
    });
  });

  describe("6.7 — within same priority, newer session appears first", () => {
    it("should sort newer sessions before older within the same priority", async () => {
      const app = createTestApp(mimoContext);

      const token = await createUser();
      const project = await createProject();

      const res1 = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Older High",
          priority: "high",
        }).toString(),
      });
      expect(res1.status).toBe(302);

      const startMs = Date.now();
      while (Date.now() === startMs) {
        // wait for next millisecond to avoid equal createdAt values
      }

      const res2 = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Newer High",
          priority: "high",
        }).toString(),
      });
      expect(res2.status).toBe(302);

      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(2);
      expect(sessions[0].name).toBe("Newer High");
      expect(sessions[1].name).toBe("Older High");
    });
  });
});
