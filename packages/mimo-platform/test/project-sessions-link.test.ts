import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";

let projectRepository: any;
let sessionRepository: any;
let userRepository: any;
let mimoContext: any;
let testHome: string;

// Helper to create test app with internal API mounted
function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createProjectsRoutes,
  } = require("../src/web/features/projects/pages/projects.tsx");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");
  const {
    createAuthRoutes,
  } = require("../src/web/features/auth/pages/auth.tsx");

  const app = new Hono();

  // Mount internal API
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

  // Mount auth routes
  app.route("/auth", createAuthRoutes(ctx));

  // Mount project routes with fetchFn that routes through app
  const projects = createProjectsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const path = new URL(urlStr).pathname;
        return app.request(path, init);
      }
      return fetch(url, init);
    },
  });

  // Mount sessions routes with same fetchFn
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

  app.route("/projects", projects);
  app.route("/projects/:projectId/sessions", sessions);

  return app;
}

describe("Project Sessions Link Integration Tests", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-project-sessions-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    mimoContext = ctx;
    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;
  });

  describe("Unified Projects Sessions Page", () => {
    it("should show sessions list when a project is selected", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      await sessionRepository.create({
        name: "Feature Implementation",
        projectId: project.id,
        owner: "testuser",
      });

      await sessionRepository.create({
        name: "Bug Fix",
        projectId: project.id,
        owner: "testuser",
      });

      const res = await app.request(`/projects?selected=${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(`Sessions for ${project.name}`);
      expect(html).toContain("Feature Implementation");
      expect(html).toContain("Bug Fix");
    });

    it("should show empty session state when no sessions exist", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const project = await projectRepository.create({
        name: "Empty Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const res = await app.request(`/projects?selected=${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("No sessions yet.");
    });

    it("should show New Session button", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const res = await app.request(`/projects?selected=${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("+ New Session");
      expect(html).toContain(`/projects/${project.id}/sessions/new`);
    });

    it("should show session links to session detail", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

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

      const res = await app.request(`/projects?selected=${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(`/projects/${project.id}/sessions/${session.id}`);
    });

    it("should order sessions by recency when priorities are equal", async () => {
      const app = createTestApp(mimoContext);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      await sessionRepository.create({
        name: "First Session",
        projectId: project.id,
        owner: "testuser",
        priority: "medium",
      });

      const startMs = Date.now();
      while (Date.now() === startMs) {
        // wait for next millisecond to avoid equal createdAt values
      }

      await sessionRepository.create({
        name: "Second Session",
        projectId: project.id,
        owner: "testuser",
        priority: "medium",
      });

      const res = await app.request(`/projects?selected=${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();

      // Second session should appear before first in the HTML
      const secondIndex = html.indexOf("Second Session");
      const firstIndex = html.indexOf("First Session");
      expect(secondIndex).toBeLessThan(firstIndex);
    });
  });
});
