import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";

import { load, dump } from "js-yaml";

// Re-import modules after setting up environment
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";

let sessionRoutes: any;
let sessionRepository: any;
let chatService: any;
let userRepository: any;
let projectRepository: any;
let authService: any;
let agentService: any;
let mimoContext: any;
let testHome: string;

describe("Session Management Integration Tests", () => {
  beforeEach(async () => {
    // Create unique test home for each test
    testHome = join(
      tmpdir(),
      `mimo-session-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    // Set up fresh environment with createMimoContext
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

    const chatModule = await import("../src/sessions/chat.ts");
    chatService = chatModule.chatService;

    authService = ctx.services.auth;
    agentService = ctx.services.agents;

    // Mock VCS methods to avoid actual git/fossil operations in these tests
    ctx.services.vcs.cloneRepository = async () => ({ success: true });
    ctx.services.vcs.importToFossil = async () => ({ success: true });
    ctx.services.vcs.openFossilCheckout = async () => ({ success: true });
    ctx.services.vcs.openFossil = async () => ({ success: true });
    ctx.services.vcs.syncIgnoresToFossil = async () => ({ success: true });
    ctx.services.vcs.createFossilUser = async () => ({ success: true });

    const { createSessionsRoutes } = await import("../src/sessions/routes.tsx");
    sessionRoutes = createSessionsRoutes(ctx);
  });

  describe("Session Creation with ACP Session Parking", () => {
    it("should render session creation form without local mirror field", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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

      let createFossilUserArgs: any[] | null = null;
      mimoContext.services.vcs.createFossilUser = async (...args: any[]) => {
        createFossilUserArgs = args;
        return { success: true };
      };

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

      expect(session).not.toBeNull();
      expect(session?.agentWorkspaceUser).toBe("dev");
      expect(session?.agentWorkspacePassword).toBeTruthy();
      expect(session?.agentWorkspacePassword?.length).toBeGreaterThanOrEqual(
        16,
      );
      expect(createFossilUserArgs).not.toBeNull();
      expect(createFossilUserArgs?.[1]).toBe("dev");
      expect(createFossilUserArgs?.[3]).toBe("s");
    });

    it("should update idleTimeoutMs via updateSessionConfig", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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

    it("should reject session creation without authentication", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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

    it("should render clone workspace action with authenticated one-command fossil open", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      expect(html).toContain("fossil open");
      expect(html).toContain("dev:p%40ss%20word@localhost:8000");
      expect(html).toContain("Fix-login-flow");
      expect(html).toContain("--workdir");
      expect(html).toContain("--repodir");
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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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

    it("persists session.branch in sync mode for push flow", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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

    it("returns 400 when sync mode has empty branchName", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
        await import("../src/sessions/session-deletion.ts");
      const { sweepExpiredInactiveSessions } =
        await import("../src/sessions/session-retention-sweeper.ts");

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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

  describe("Session Settings - Creation Metadata Display", () => {
    it("should show all creation fields with persisted values on settings page", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
