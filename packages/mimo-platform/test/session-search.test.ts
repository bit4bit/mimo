import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import bcrypt from "bcrypt";

import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";

let sessionRoutes: any;
let sessionRepository: any;
let projectRepository: any;
let userRepository: any;
let authService: any;
let testHome: string;
let mimoContext: any;

describe("Session Search API", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-session-search-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
      services: { sharedFossil: new DummySharedFossilServer() },
    });
    mimoContext = ctx;

    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;
    authService = ctx.services.auth;

    ctx.services.vcs.cloneRepository = async () => ({ success: true });
    ctx.services.vcs.importToFossil = async () => ({ success: true });
    ctx.services.vcs.openFossil = async () => ({ success: true });
    ctx.services.vcs.createFossilUser = async () => ({ success: true });

    const { createSessionsRoutes } = await import("../src/sessions/routes.tsx");
    sessionRoutes = createSessionsRoutes(ctx);
  });

  describe("GET /sessions/search", () => {
    it("returns 401 for unauthenticated request", async () => {
      const app = new Hono();
      app.route("/sessions", sessionRoutes);

      const res = await app.request("/sessions/search");

      expect(res.status).toBe(401);
    });

    it("returns sessions filtered by query matching session name", async () => {
      const app = new Hono();
      app.route("/sessions", sessionRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
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
      const app = new Hono();
      app.route("/sessions", sessionRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
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
      const app = new Hono();
      app.route("/sessions", sessionRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      await sessionRepository.create({
        name: "Old Session",
        projectId: project.id,
        owner: "testuser",
      });

      const recentSession = await sessionRepository.create({
        name: "Recent Session",
        projectId: project.id,
        owner: "testuser",
      });
      await sessionRepository.touchSessionActivity(recentSession.id);

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
      const app = new Hono();
      app.route("/sessions", sessionRoutes);

      await userRepository.create("user1", await bcrypt.hash("password", 10));
      await userRepository.create("user2", await bcrypt.hash("password", 10));

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
      const app = new Hono();
      app.route("/sessions", sessionRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
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
      const app = new Hono();
      app.route("/sessions", sessionRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
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
