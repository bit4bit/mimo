import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";

import { load, dump } from "js-yaml";

// Re-import modules after setting up environment
import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";
import { resetGlobalState } from "./test-helpers.js";

let sessionRoutes: any;
let sessionRepository: any;
let chatService: any;
let userRepository: any;
let projectRepository: any;
let credentialRepository: any;
let authService: any;
let agentService: any;
let mimoContext: any;
let testHome: string;

// Helper to create test app with internal API mounted
function createTestApp(ctx: any, _sessionsR: any): Hono {
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
        // Extract the path from the full URL
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

describe("Session Management Integration Tests", () => {
  beforeEach(async () => {
    // Create unique test home for each test
    testHome = join(
      tmpdir(),
      `mimo-session-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    // Set up fresh environment with createMimoContext
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
      services: { sharedVcs: new DummyGitHttpServer() },
    });
    mimoContext = ctx;

    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    credentialRepository = ctx.repos.credentials;
    sessionRepository = ctx.repos.sessions;

    const chatModule = await import("../src/domain/sessions/chat.ts");
    chatService = chatModule.chatService;

    authService = ctx.services.auth;
    agentService = ctx.services.agents;

    // Mock VCS methods to avoid actual git/fossil operations in these tests
    ctx.services.vcs.cloneRepository = async () => ({ success: true });
    ctx.services.vcs.importToFossil = async () => ({ success: true });
    ctx.services.vcs.seedSessionRepo = async () => ({ success: true });
    ctx.services.vcs.clonePlatformCheckout = async () => ({ success: true });
    ctx.services.vcs.syncIgnoresToGit = async () => ({ success: true });
    ctx.services.vcs.createBranch = async () => ({ success: true });
    ctx.services.vcs.setFossilProjectName = async () => ({ success: true });
    ctx.services.vcs.openFossilCheckout = async () => ({ success: true });
    ctx.services.vcs.openFossil = async () => ({ success: true });
    ctx.services.vcs.syncIgnoresToFossil = async () => ({ success: true });
    ctx.services.vcs.createFossilUser = async () => ({ success: true });
    // Default sync-mode HEAD check passes — individual tests override to
    // exercise the mismatch path.
    ctx.services.vcs.getCurrentBranch = async (
      _repoType: "git" | "fossil",
      _workDir: string,
    ) => ({ success: true, branch: "__sync_head__" });

    const { createSessionsRoutes } =
      await import("../src/web/features/sessions/pages/sessions.tsx");
    sessionRoutes = createSessionsRoutes(ctx);
  });

  afterEach(async () => {
    await resetGlobalState();
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Session Creation with ACP Session Parking", () => {
    it("should render session creation form without local mirror field", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions/new`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).not.toContain("Local Development Mirror");
      expect(html).not.toContain('name="localDevMirrorPath"');
      expect(html).toContain('name="branchMode"');
      expect(html).toContain('name="sessionTtlDays"');
      expect(html).toContain('value="new"');
      expect(html).toContain('value="sync"');
    });

    it("should create session with ttl days from creation form", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "TTL Session",
          sessionTtlDays: "365",
        }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop();
      const session = await sessionRepository.findById(sessionId!);
      expect(session).not.toBeNull();
      expect(session?.sessionTtlDays).toBe(365);
    });

    it("should create a new session for a project", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      // Create user and project
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

      const token = await authService.generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "Feature Branch Session");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toMatch(
        /^\/projects\/[^\/]+\/sessions\/[^\/]+$/,
      );

      // Verify session was created
      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(1);
      expect(sessions[0].name).toBe("Feature Branch Session");
    });

    it("should create session with default idleTimeoutMs of 10 minutes", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Test Session" }).toString(),
      });

      expect(res.status).toBe(302);

      const location = res.headers.get("location") || "";
      const sessionId = location.split("/").pop();
      const session = await sessionRepository.findById(sessionId!);

      expect(session).not.toBeNull();
      expect(session?.idleTimeoutMs).toBe(600000); // 10 minutes default
      expect(session?.sessionTtlDays).toBe(180); // 6 months default
      expect(session?.lastActivityAt).toBeNull();
      expect(session?.acpStatus).toBe("active");
    });

    it("should apply backward-compatible defaults for retention fields", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Legacy Session" }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop();
      const sessionPath = join(
        testHome,
        "projects",
        project.id,
        "sessions",
        sessionId!,
        "session.yaml",
      );

      const yamlData = (load(readFileSync(sessionPath, "utf-8")) as Record<
        string,
        unknown
      >)!;
      delete yamlData.sessionTtlDays;
      delete yamlData.lastActivityAt;
      writeFileSync(sessionPath, dump(yamlData), "utf-8");

      const hydrated = await sessionRepository.findById(sessionId!);
      expect(hydrated).not.toBeNull();
      expect(hydrated?.sessionTtlDays).toBe(180);
      expect(hydrated?.lastActivityAt).toBeNull();
    });

    it("should provision dev workspace credentials during session creation", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Dev Workspace Session" }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop();
      const session = await sessionRepository.findById(sessionId!);

      // Credentials are provisioned on the session; auth is enforced by the
      // GitHttpServer verifier, so no repo-side user is created.
      expect(session).not.toBeNull();
      expect(session?.agentWorkspaceUser).toBe("dev");
      expect(session?.agentWorkspacePassword).toBeTruthy();
      expect(session?.agentWorkspacePassword?.length).toBeGreaterThanOrEqual(
        16,
      );
    });

    it("should update idleTimeoutMs via updateSessionConfig", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Test Session" }).toString(),
      });

      expect(res.status).toBe(302);

      const location = res.headers.get("location") || "";
      const sessionId = location.split("/").pop();

      // Update idle timeout via API
      const patchRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/config`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ idleTimeoutMs: 120000 }), // 2 minutes
        },
      );

      expect(patchRes.status).toBe(200);

      const updatedSession = await sessionRepository.findById(sessionId!);
      expect(updatedSession?.idleTimeoutMs).toBe(120000);
    });

    it("should update sessionTtlDays via updateSessionConfig", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");
      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Retention Session" }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop();

      const patchRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/config`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ sessionTtlDays: 365 }),
        },
      );

      expect(patchRes.status).toBe(200);
      const updatedSession = await sessionRepository.findById(sessionId!);
      expect(updatedSession?.sessionTtlDays).toBe(365);
    });

    it("should reject invalid sessionTtlDays", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");
      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Retention Session" }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop();

      const patchRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/config`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ sessionTtlDays: 0 }),
        },
      );

      expect(patchRes.status).toBe(400);
    });

    it("should reject idleTimeoutMs below 10000ms", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Test Session" }).toString(),
      });

      expect(res.status).toBe(302);

      const location = res.headers.get("location") || "";
      const sessionId = location.split("/").pop();

      const patchRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/config`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ idleTimeoutMs: 5000 }), // Too low
        },
      );

      expect(patchRes.status).toBe(400);
    });

    it("should default browserNotificationsEnabled to false on new session", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");
      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Notification Test Session",
        }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop();
      const session = await sessionRepository.findById(sessionId!);
      expect(session).not.toBeNull();
      expect(session?.browserNotificationsEnabled).toBe(false);
    });

    it("should update browserNotificationsEnabled via PATCH config", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");
      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Notification Patch Session",
        }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop();

      const patchRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/config`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ browserNotificationsEnabled: true }),
        },
      );

      expect(patchRes.status).toBe(200);
      const updatedSession = await sessionRepository.findById(sessionId!);
      expect(updatedSession?.browserNotificationsEnabled).toBe(true);
    });

    it("should update browserNotificationsEnabled via PATCH config", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");
      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "API Response Session" }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop();

      const patchRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/config`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ browserNotificationsEnabled: true }),
        },
      );

      expect(patchRes.status).toBe(200);

      // Verify persistence
      const updatedSession = await sessionRepository.findById(sessionId!);
      expect(updatedSession?.browserNotificationsEnabled).toBe(true);
    });

    it("should handle sessions without browserNotificationsEnabled field", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");
      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Legacy Field Session" }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop();
      const sessionPath = join(
        testHome,
        "projects",
        project.id,
        "sessions",
        sessionId!,
        "session.yaml",
      );

      const yamlData = (load(readFileSync(sessionPath, "utf-8")) as Record<
        string,
        unknown
      >)!;
      delete yamlData.browserNotificationsEnabled;
      writeFileSync(sessionPath, dump(yamlData), "utf-8");

      const hydrated = await sessionRepository.findById(sessionId!);
      expect(hydrated).not.toBeNull();
      expect(hydrated?.browserNotificationsEnabled).toBe(false);
    });

    it("should reject non-boolean browserNotificationsEnabled in PATCH config", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");
      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Validation Session" }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop();

      const patchRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/config`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ browserNotificationsEnabled: "yes" }),
        },
      );

      expect(patchRes.status).toBe(400);
    });

    it("should reject session creation without authentication", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const formData = new URLSearchParams();
      formData.append("name", "Test Session");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth/login");
    });

    it("should reject session with missing name", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const formData = new URLSearchParams();
      // No name

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Session Listing", () => {
    it("should list all sessions for a project", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      // Create sessions
      await sessionRepository.create({
        name: "Session 1",
        projectId: project.id,
        owner: "testuser",
      });

      await sessionRepository.create({
        name: "Session 2",
        projectId: project.id,
        owner: "testuser",
      });

      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        `/projects?selected=${project.id}`,
      );
    });

    it("should show empty state", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        `/projects?selected=${project.id}`,
      );
    });
  });

  describe("Session View", () => {
    it("should show session with three-buffer layout", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Test Session");
      // Check for key UI elements that exist in the session view
      expect(html).toContain("Chat");
      expect(html).toContain("Notes");
      expect(html).toContain("Impact");
      expect(html).toContain(`href="/projects?selected=${project.id}"`);
    });

    it("should return 404 for non-existent session", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/non-existent-id`,
        {
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(404);
    });

    it("should render clone workspace action with authenticated one-command git clone", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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
        name: "Fix/login\\flow",
        projectId: project.id,
        owner: "testuser",
      });
      await sessionRepository.update(session.id, {
        agentWorkspaceUser: "dev",
        agentWorkspacePassword: "p@ss word",
      });

      const token = await authService.generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("clone-workspace-btn");
      expect(html).toContain("clone-workspace-dialog");
      expect(html).toContain("git clone");
      expect(html).toContain("dev:p%40ss%20word@localhost:8000");
      expect(html).toContain("Fix-login-flow");
    });

    it("uses MIMO_PUBLIC_VCS_URL for the clone command when configured", async () => {
      // External deployment behind a custom domain / reverse proxy: the clone
      // command shown to the user must use the public base URL, not the internal
      // VCS server host/port.
      mimoContext.env.MIMO_PUBLIC_VCS_URL = "https://yourdomain.com/git";
      const app = createTestApp(mimoContext, sessionRoutes);

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
        name: "My Session",
        projectId: project.id,
        owner: "testuser",
      });
      await sessionRepository.update(session.id, {
        agentWorkspaceUser: "dev",
        agentWorkspacePassword: "secret",
      });

      const token = await authService.generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      // Public base + path, correct scheme, no raw :8000 internal port.
      expect(html).toContain(
        `https://dev:secret@yourdomain.com/git/${session.id}.git/`,
      );
      expect(html).not.toContain("localhost:8000");
    });
  });

  describe("Session Branch Override", () => {
    async function createUserAndProject(extra: Record<string, unknown> = {}) {
      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        ...extra,
      });
      const token = await authService.generateToken("testuser");
      return { project, token };
    }

    it("should call createBranch with session branchName override", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      let capturedBranch: string | null = null;
      mimoContext.services.vcs.createBranch = async (branch: string) => {
        capturedBranch = branch;
        return { success: true };
      };
      mimoContext.services.vcs.createFossilUser = async () => ({
        success: true,
      });

      const { project, token } = await createUserAndProject({
        newBranch: "project-default",
      });

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "My Session",
          branchName: "feature/override",
          branchMode: "new",
        }).toString(),
      });

      expect(res.status).toBe(302);
      expect(capturedBranch).toBe("feature/override");
    });

    it("should fall back to project newBranch when no session branchName", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      let capturedBranch: string | null = null;
      mimoContext.services.vcs.createBranch = async (branch: string) => {
        capturedBranch = branch;
        return { success: true };
      };
      mimoContext.services.vcs.createFossilUser = async () => ({
        success: true,
      });

      const { project, token } = await createUserAndProject({
        newBranch: "project-default",
      });

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "My Session",
          branchMode: "new",
        }).toString(),
      });

      expect(res.status).toBe(302);
      expect(capturedBranch).toBe("project-default");
    });

    it("should not call createBranch when no branchName and no project newBranch", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      let createBranchCalled = false;
      mimoContext.services.vcs.createBranch = async () => {
        createBranchCalled = true;
        return { success: true };
      };
      mimoContext.services.vcs.createFossilUser = async () => ({
        success: true,
      });

      const { project, token } = await createUserAndProject();

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "My Session",
          branchMode: "new",
        }).toString(),
      });

      expect(res.status).toBe(302);
      expect(createBranchCalled).toBe(false);
    });

    it("defaults to new mode when branchMode is omitted", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      let capturedBranch: string | null = null;
      mimoContext.services.vcs.createBranch = async (branch: string) => {
        capturedBranch = branch;
        return { success: true };
      };
      mimoContext.services.vcs.createFossilUser = async () => ({
        success: true,
      });

      const { project, token } = await createUserAndProject();

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "My Session",
          branchName: "feature/legacy-client",
        }).toString(),
      });

      expect(res.status).toBe(302);
      expect(capturedBranch).toBe("feature/legacy-client");
    });
  });

  describe("Session Branch Sync Mode", () => {
    async function createUserAndProject(extra: Record<string, unknown> = {}) {
      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        ...extra,
      });
      const token = await authService.generateToken("testuser");
      return { project, token };
    }

    it("clones existing remote branch directly and skips createBranch", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      let cloneArgs: any[] | null = null;
      let createBranchCalled = false;
      mimoContext.services.vcs.cloneRepository = async (...args: any[]) => {
        cloneArgs = args;
        return { success: true };
      };
      mimoContext.services.vcs.createBranch = async () => {
        createBranchCalled = true;
        return { success: true };
      };
      mimoContext.services.vcs.createFossilUser = async () => ({
        success: true,
      });
      mimoContext.services.vcs.getCurrentBranch = async () => ({
        success: true,
        branch: "feature/existing",
      });

      const { project, token } = await createUserAndProject({
        sourceBranch: "main",
      });

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "My Session",
          branchName: "feature/existing",
          branchMode: "sync",
        }).toString(),
      });

      expect(res.status).toBe(302);
      // cloneRepository signature: (repoUrl, repoType, targetDir, credential, sourceBranch)
      expect(cloneArgs?.[4]).toBe("feature/existing");
      expect(createBranchCalled).toBe(false);
    });

    it("passes project SSH credential to projectVcsCache.clone", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      let cloneArgs: any[] | null = null;
      mimoContext.services.projectVcsCache.clone = async (...args: any[]) => {
        cloneArgs = args;
        return { success: true };
      };
      mimoContext.services.vcs.createFossilUser = async () => ({
        success: true,
      });
      mimoContext.services.vcs.getCurrentBranch = async () => ({
        success: true,
        branch: "feature/existing",
      });

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const credential = await credentialRepository.create({
        name: "codeberg-ssh",
        type: "ssh",
        owner: "testuser",
        privateKey:
          "-----BEGIN OPENSSH PRIVATE KEY-----\nmock\n-----END OPENSSH PRIVATE KEY-----",
      });
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "git@codeberg.org:user/repo.git",
        repoType: "git",
        owner: "testuser",
        credentialId: credential.id,
      });
      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "My Session",
          branchName: "feature/existing",
          branchMode: "sync",
        }).toString(),
      });

      expect(res.status).toBe(302);
      expect(cloneArgs?.[0]).toBeDefined();
      expect(cloneArgs?.[0].credential).toBeDefined();
      expect(cloneArgs?.[0].credential.type).toBe("ssh");
      expect(cloneArgs?.[0].credential.id).toBe(credential.id);
      expect(cloneArgs?.[0].branch).toBe("feature/existing");
    });

    it("persists session.branch in sync mode for push flow", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      mimoContext.services.vcs.createFossilUser = async () => ({
        success: true,
      });
      mimoContext.services.vcs.getCurrentBranch = async () => ({
        success: true,
        branch: "feature/pushback",
      });

      const { project, token } = await createUserAndProject();

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Sync Session",
          branchName: "feature/pushback",
          branchMode: "sync",
        }).toString(),
      });

      expect(res.status).toBe(302);
      const sessionId = (res.headers.get("location") || "").split("/").pop()!;
      const session = await sessionRepository.findById(sessionId);
      expect(session?.branch).toBe("feature/pushback");
    });

    it("fails sync when checkout HEAD does not match requested branch", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      // Simulate cloneRepository succeeding (e.g., a buggy fallback) but
      // leaving HEAD on a different branch than the user requested.
      mimoContext.services.vcs.cloneRepository = async () => ({
        success: true,
      });
      mimoContext.services.vcs.getCurrentBranch = async () => ({
        success: true,
        branch: "main",
      });

      const { project, token } = await createUserAndProject();

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Mismatched Sync",
          branchName: "feature/does-not-exist",
          branchMode: "sync",
        }).toString(),
      });

      expect(res.status).toBe(500);
      const body = await res.text();
      expect(body).toContain("feature/does-not-exist");
      expect(body).toContain("main");
    });

    it("returns 400 when sync mode has empty branchName", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      const { project, token } = await createUserAndProject();

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "My Session",
          branchMode: "sync",
        }).toString(),
      });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain("Branch name is required");
    });

    it("returns 400 when sync mode is used on fossil project", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      const { project, token } = await createUserAndProject({
        repoType: "fossil",
      });

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "My Session",
          branchName: "feature/existing",
          branchMode: "sync",
        }).toString(),
      });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain("git repositories");
    });

    it("returns 500 and deletes session when sync clone fails", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

      mimoContext.services.vcs.cloneRepository = async () => ({
        success: false,
        error: "Remote branch feature/missing not found in upstream origin",
      });
      mimoContext.services.vcs.createFossilUser = async () => ({
        success: true,
      });

      const { project, token } = await createUserAndProject();

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Doomed Session",
          branchName: "feature/missing",
          branchMode: "sync",
        }).toString(),
      });

      expect(res.status).toBe(500);
      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(0);
    });
  });

  describe("Session Deletion", () => {
    it("should delete session with cleanup", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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
        name: "Session To Delete",
        projectId: project.id,
        owner: "testuser",
      });

      const token = await authService.generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/delete`,
        {
          method: "POST",
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        `/projects?selected=${project.id}`,
      );

      // Verify session was deleted
      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(0);
    });

    it("should create then auto-delete expired inactive session via sweeper", async () => {
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
        name: "Expired Session",
        projectId: project.id,
        owner: "testuser",
        sessionTtlDays: 1,
      });

      await sessionRepository.update(session.id, {
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        lastActivityAt: null,
      });

      const { createSessionDeletionUseCase } =
        await import("../src/domain/sessions/session-deletion.ts");
      const { sweepExpiredInactiveSessions } =
        await import("../src/domain/sessions/session-retention-sweeper.ts");

      const sessionDeletion = createSessionDeletionUseCase({
        sessionRepository: mimoContext.repos.sessions,
        sessionStateService: mimoContext.services.sessionState,
        fileSyncService: mimoContext.services.fileSync,
        impactCalculator: mimoContext.services.impactCalculator,
        agentService: mimoContext.services.agents,
        mcpTokenStore: {
          revoke: () => {},
        },
      });

      const sweepResult = await sweepExpiredInactiveSessions({
        sessionRepository: mimoContext.repos.sessions,
        sessionDeletion,
      });

      expect(sweepResult.deleted).toBe(1);

      const deleted = await sessionRepository.findById(session.id);
      expect(deleted).toBeNull();

      const remaining = await sessionRepository.listByProject(project.id);
      expect(remaining.length).toBe(0);
    });

    it("should hide delete button while session is active", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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
        name: "Active Session",
        projectId: project.id,
        owner: "testuser",
      });

      await sessionRepository.update(session.id, {
        lastActivityAt: new Date().toISOString(),
      });

      const token = await authService.generateToken("testuser");
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).not.toContain("Delete Session");
    });

    it("should show delete button when session is inactive", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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
        name: "Inactive Session",
        projectId: project.id,
        owner: "testuser",
      });

      await sessionRepository.update(session.id, {
        lastActivityAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      });

      const token = await authService.generateToken("testuser");
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Delete Session");
    });
  });

  describe("Session Close Reason", () => {
    async function setupCloseTest() {
      const app = createTestApp(mimoContext, sessionRoutes);
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
        name: "Session To Close",
        projectId: project.id,
        owner: "testuser",
      });
      const token = await authService.generateToken("testuser");
      return { app, project, session, token };
    }

    it("4.1 GET close page renders radio group (4 options) and note input with session name", async () => {
      const { app, project, session, token } = await setupCloseTest();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/close`,
        { headers: { Cookie: `token=${token}` } },
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Close Session");
      expect(html).toContain("Session To Close");
      expect(html).toContain('name="reason"');
      expect(html).toContain('value="implemented"');
      expect(html).toContain('value="invalid expectations"');
      expect(html).toContain('value="wrong implementation"');
      expect(html).toContain('value="no reason"');
      expect(html).toContain('name="note"');
      expect(html).toContain('action="/sessions/');
      expect(html).toContain("ctrlKey");
      expect(html).toContain("metaKey");
    });

    it("4.2 POST close with radio selection and empty note persists radio label as closeReason", async () => {
      const { app, project, session, token } = await setupCloseTest();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/close`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `token=${token}`,
          },
          body: new URLSearchParams({
            reason: "implemented",
            note: "",
          }).toString(),
        },
      );

      expect(res.status).toBe(302);
      const updated = await sessionRepository.findById(session.id);
      expect(updated?.status).toBe("closed");
      expect(updated?.closeReason).toBe("implemented");
    });

    it("4.3 POST close with note overrides radio selection (stores note, not combined)", async () => {
      const { app, project, session, token } = await setupCloseTest();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/close`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `token=${token}`,
          },
          body: new URLSearchParams({
            reason: "implemented",
            note: "shipped auth flow",
          }).toString(),
        },
      );

      expect(res.status).toBe(302);
      const updated = await sessionRepository.findById(session.id);
      expect(updated?.status).toBe("closed");
      expect(updated?.closeReason).toBe("shipped auth flow");
      expect(updated?.closeReason).not.toContain("implemented");
    });

    it("4.4 POST close with no reason and empty note stores closeReason: undefined", async () => {
      const { app, project, session, token } = await setupCloseTest();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/close`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `token=${token}`,
          },
          body: new URLSearchParams({
            reason: "no reason",
            note: "",
          }).toString(),
        },
      );

      expect(res.status).toBe(302);
      const updated = await sessionRepository.findById(session.id);
      expect(updated?.status).toBe("closed");
      expect(updated?.closeReason).toBeUndefined();
    });

    it("4.5 POST close with no reason and a note stores the note", async () => {
      const { app, project, session, token } = await setupCloseTest();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/close`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `token=${token}`,
          },
          body: new URLSearchParams({
            reason: "no reason",
            note: "duplicate session",
          }).toString(),
        },
      );

      expect(res.status).toBe(302);
      const updated = await sessionRepository.findById(session.id);
      expect(updated?.status).toBe("closed");
      expect(updated?.closeReason).toBe("duplicate session");
    });

    it("4.6 Cancel redirects back to session detail without closing", async () => {
      const { app, project, session, token } = await setupCloseTest();

      const closePageRes = await app.request(
        `/projects/${project.id}/sessions/${session.id}/close`,
        {
          headers: {
            Cookie: `token=${token}`,
            Referer: `/projects/${project.id}/sessions/${session.id}`,
          },
        },
      );

      expect(closePageRes.status).toBe(200);
      const html = await closePageRes.text();
      expect(html).toContain(`/projects/${project.id}/sessions/${session.id}`);

      const unchanged = await sessionRepository.findById(session.id);
      expect(unchanged?.status).toBe("active");
    });

    it("4.7 Close reason appears in session detail for closed sessions", async () => {
      const { app, project, token } = await setupCloseTest();

      const closedSession = await sessionRepository.create({
        name: "Closed Session",
        projectId: project.id,
        owner: "testuser",
      });
      await sessionRepository.update(closedSession.id, {
        status: "closed",
        closeReason: "wrong implementation",
      });

      const res = await app.request(
        `/projects/${project.id}/sessions/${closedSession.id}`,
        { headers: { Cookie: `token=${token}` } },
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("wrong implementation");
    });

    it("POST close with no body defaults to no reason (closeReason: undefined)", async () => {
      const { app, project, session, token } = await setupCloseTest();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/close`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `token=${token}`,
          },
          body: new URLSearchParams({}).toString(),
        },
      );

      expect(res.status).toBe(302);
      const updated = await sessionRepository.findById(session.id);
      expect(updated?.status).toBe("closed");
      expect(updated?.closeReason).toBeUndefined();
    });
  });

  describe("Session Settings - Creation Metadata Display", () => {
    it("should show all creation fields with persisted values on settings page", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      // Create agent — assigned directly via repository to test backward compat display
      const agent = await agentService.createAgent({
        name: "myagent",
        owner: "testuser",
        provider: "opencode",
      });

      const token = await authService.generateToken("testuser");

      // Create session without agent (agent selection moved to thread creation)
      const createRes = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Feature Branch Session",
          agentSubpath: "src/backend",
          branchName: "feature/test",
        }).toString(),
      });

      expect(createRes.status).toBe(302);
      const location = createRes.headers.get("location") || "";
      const sessionId = location.split("/").pop();

      // Assign agent directly via repository (backward compat — legacy sessions may have this)
      await sessionRepository.update(sessionId, { assignedAgentId: agent.id });

      // View settings page
      const settingsRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/settings`,
        {
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(settingsRes.status).toBe(200);
      const html = await settingsRes.text();

      // Verify creation fields are displayed
      expect(html).toContain("Creation Settings");
      expect(html).toContain("Session Name");
      expect(html).toContain("Feature Branch Session");
      expect(html).toContain("Assigned Agent");
      expect(html).toContain("myagent"); // agent name
      expect(html).toContain("Agent working directory");
      expect(html).toContain("src/backend");
      expect(html).not.toContain("Local Development Mirror");
      expect(html).not.toContain("/dev/mirror");
      expect(html).toContain("Branch");
      expect(html).toContain("feature/test");
    });

    it("should show fallback labels when optional creation fields are empty", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      // Create session with minimal fields
      const createRes = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Simple Session",
        }).toString(),
      });

      expect(createRes.status).toBe(302);
      const location = createRes.headers.get("location") || "";
      const sessionId = location.split("/").pop();

      // View settings page
      const settingsRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/settings`,
        {
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(settingsRes.status).toBe(200);
      const html = await settingsRes.text();

      // Verify fallback labels are displayed
      expect(html).toContain("Creation Settings");
      expect(html).toContain("Session Name");
      expect(html).toContain("Simple Session");
      expect(html).toContain("Assigned Agent");
      expect(html).toContain("None"); // fallback for no agent
      expect(html).toContain("Agent working directory");
      expect(html).toContain("Repository root"); // fallback
      expect(html).not.toContain("Local Development Mirror");
      expect(html).not.toContain("Disabled");
      expect(html).toContain("Branch");
      expect(html).toContain("Not set"); // fallback
      expect(html).toContain("MCP Servers");
      expect(html).toContain("None attached"); // fallback
    });

    it("should keep runtime settings (idle timeout) editable", async () => {
      const app = createTestApp(mimoContext, sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      // Create session
      const createRes = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Test Session",
        }).toString(),
      });

      expect(createRes.status).toBe(302);
      const location = createRes.headers.get("location") || "";
      const sessionId = location.split("/").pop();

      // View settings page
      const settingsRes = await app.request(
        `/projects/${project.id}/sessions/${sessionId}/settings`,
        {
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(settingsRes.status).toBe(200);
      const html = await settingsRes.text();

      // Verify creation section is read-only (no input for creation fields)
      expect(html).toContain("Creation Settings");

      // Verify runtime section with editable timeout exists
      expect(html).toContain("Idle Timeout");
      expect(html).toContain("select");
      expect(html).toContain("Update Settings");
    });
  });
});
