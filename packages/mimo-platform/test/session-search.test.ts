import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";

import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

let sessionRepository: any;
let projectRepository: any;
let userRepository: any;
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

describe("Session Search API", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-session-search-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    ctx.services.vcs.openFossil = async () => ({ success: true });
    ctx.services.vcs.createFossilUser = async () => ({ success: true });
  });

  describe("GET /sessions/search", () => {
    it("returns 401 for unauthenticated request", async () => {
      const app = createTestApp(mimoContext);

      const res = await app.request("/sessions/search");

      expect(res.status).toBe(401);
    });

    it("returns sessions filtered by query matching session name", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      await sessionRepository.create({
        name: "Authentication Fix",
        projectId: project.id,
        owner: "testuser",
      });
      await sessionRepository.create({
        name: "UI Improvements",
        projectId: project.id,
        owner: "testuser",
      });

      const token = await authService.generateToken("testuser");
      const res = await app.request("/sessions/search?q=auth", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].sessionName).toBe("Authentication Fix");
    });

    it("returns sessions filtered by query matching project name", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const project1 = await projectRepository.create({
        name: "Frontend App",
        repoUrl: "https://github.com/user/frontend.git",
        repoType: "git",
        owner: "testuser",
      });
      const project2 = await projectRepository.create({
        name: "Backend API",
        repoUrl: "https://github.com/user/backend.git",
        repoType: "git",
        owner: "testuser",
      });

      await sessionRepository.create({
        name: "Session A",
        projectId: project1.id,
        owner: "testuser",
      });
      await sessionRepository.create({
        name: "Session B",
        projectId: project2.id,
        owner: "testuser",
      });

      const token = await authService.generateToken("testuser");
      const res = await app.request("/sessions/search?q=back", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].projectName).toBe("Backend API");
    });

    it("returns empty query returns recent sessions", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const oldSession = await sessionRepository.create({
        name: "Old Session",
        projectId: project.id,
        owner: "testuser",
      });

      const recentSession = await sessionRepository.create({
        name: "Recent Session",
        projectId: project.id,
        owner: "testuser",
      });
      await sessionRepository.touchSessionActivity(
        oldSession.id,
        "2020-01-01T00:00:00.000Z",
      );
      await sessionRepository.touchSessionActivity(
        recentSession.id,
        "2030-01-01T00:00:00.000Z",
      );

      const token = await authService.generateToken("testuser");
      const res = await app.request("/sessions/search", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThan(0);
      expect(body[0].sessionName).toBe("Recent Session");
    });

    it("only returns sessions owned by authenticated user", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "user1",
        await Bun.password.hash("password", { algorithm: "bcrypt", cost: 10 }),
      );
      await userRepository.create(
        "user2",
        await Bun.password.hash("password", { algorithm: "bcrypt", cost: 10 }),
      );

      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "user1",
      });

      await sessionRepository.create({
        name: "User1 Session",
        projectId: project.id,
        owner: "user1",
      });
      await sessionRepository.create({
        name: "User2 Session",
        projectId: project.id,
        owner: "user2",
      });

      const token = await authService.generateToken("user1");
      const res = await app.request("/sessions/search", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].sessionName).toBe("User1 Session");
    });

    it("returns up to 10 sessions", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      for (let i = 0; i < 15; i++) {
        await sessionRepository.create({
          name: `Session ${i}`,
          projectId: project.id,
          owner: "testuser",
        });
      }

      const token = await authService.generateToken("testuser");
      const res = await app.request("/sessions/search", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBeLessThanOrEqual(10);
    });

    it("returns JSON with required fields", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      const token = await authService.generateToken("testuser");
      const res = await app.request("/sessions/search", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body[0]).toHaveProperty("sessionId");
      expect(body[0]).toHaveProperty("sessionName");
      expect(body[0]).toHaveProperty("projectId");
      expect(body[0]).toHaveProperty("projectName");
      expect(body[0]).toHaveProperty("status");
      expect(body[0].sessionId).toBe(session.id);
      expect(body[0].sessionName).toBe("Test Session");
      expect(body[0].projectName).toBe("Test Project");
      expect(body[0].status).toBe("active");
    });
  });
});
