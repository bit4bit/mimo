import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import bcrypt from "bcrypt";

// Re-import modules after setting up environment
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";

let sessionRoutes: any;
let sessionRepository: any;
let chatService: any;
let userRepository: any;
let projectRepository: any;
let authService: any;
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

    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;

    const chatModule = await import("../src/sessions/chat.ts");
    chatService = chatModule.chatService;

    authService = ctx.services.auth;

    // Mock VCS methods to avoid actual git/fossil operations in these tests
    const vcsModule = await import("../src/vcs/index.ts");
    vcsModule.vcs.cloneRepository = async () => ({ success: true });
    vcsModule.vcs.importToFossil = async () => ({ success: true });
    vcsModule.vcs.openFossilCheckout = async () => ({ success: true });
    vcsModule.vcs.openFossil = async () => ({ success: true });
    vcsModule.vcs.syncIgnoresToFossil = async () => ({ success: true });

    const { createSessionsRoutes } = await import("../src/sessions/routes.tsx");
    sessionRoutes = createSessionsRoutes(ctx);
  });

  describe("Session Creation with ACP Session Parking", () => {
    it("should create a new session for a project", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Create user and project
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
        await bcrypt.hash("testpass", 10),
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
      expect(session?.acpStatus).toBe("active");
    });

    it("should update idleTimeoutMs via updateSessionConfig", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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

    it("should reject idleTimeoutMs below 10000ms", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
        await bcrypt.hash("testpass", 10),
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
        await bcrypt.hash("testpass", 10),
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

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Session 1");
      expect(html).toContain("Session 2");
    });

    it("should show empty state", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("No sessions");
    });
  });

  describe("Session View", () => {
    it("should show session with three-buffer layout", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
    });

    it("should return 404 for non-existent session", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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

      const token = await authService.generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/non-existent-id`,
        {
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(404);
    });
  });

  describe("Session Branch Override", () => {
    async function createUserAndProject(extra: Record<string, unknown> = {}) {
      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
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

      const vcsModule = await import("../src/vcs/index.ts");
      let capturedBranch: string | null = null;
      vcsModule.vcs.createBranch = async (branch: string) => {
        capturedBranch = branch;
        return { success: true };
      };
      vcsModule.vcs.createFossilUser = async () => ({ success: true });

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
        }).toString(),
      });

      expect(res.status).toBe(302);
      expect(capturedBranch).toBe("feature/override");
    });

    it("should fall back to project newBranch when no session branchName", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      const vcsModule = await import("../src/vcs/index.ts");
      let capturedBranch: string | null = null;
      vcsModule.vcs.createBranch = async (branch: string) => {
        capturedBranch = branch;
        return { success: true };
      };
      vcsModule.vcs.createFossilUser = async () => ({ success: true });

      const { project, token } = await createUserAndProject({
        newBranch: "project-default",
      });

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "My Session" }).toString(),
      });

      expect(res.status).toBe(302);
      expect(capturedBranch).toBe("project-default");
    });

    it("should not call createBranch when no branchName and no project newBranch", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      const vcsModule = await import("../src/vcs/index.ts");
      let createBranchCalled = false;
      vcsModule.vcs.createBranch = async () => {
        createBranchCalled = true;
        return { success: true };
      };
      vcsModule.vcs.createFossilUser = async () => ({ success: true });

      const { project, token } = await createUserAndProject();

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "My Session" }).toString(),
      });

      expect(res.status).toBe(302);
      expect(createBranchCalled).toBe(false);
    });
  });

  describe("Session Deletion", () => {
    it("should delete session with cleanup", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
        `/projects/${project.id}/sessions`,
      );

      // Verify session was deleted
      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(0);
    });
  });

  describe("Session Settings - Creation Metadata Display", () => {
    it("should show all creation fields with persisted values on settings page", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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

      // Create agent to be assigned
      const agentRes = await import("../src/agents/agent-registry.ts");
      const agentRegistry = agentRes.agentRegistry;
      const agent = await agentRegistry.register(
        "myagent",
        { type: "test", apiEndpoint: "http://localhost:9000" },
      );

      const token = await authService.generateToken("testuser");

      // Create session with all creation fields
      const createRes = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          name: "Feature Branch Session",
          assignedAgentId: agent.id,
          agentSubpath: "src/backend",
          localDevMirrorPath: "/dev/mirror",
          branchName: "feature/test",
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

      // Verify creation fields are displayed
      expect(html).toContain("Creation Settings");
      expect(html).toContain("Session Name");
      expect(html).toContain("Feature Branch Session");
      expect(html).toContain("Assigned Agent");
      expect(html).toContain("myagent"); // agent name
      expect(html).toContain("Agent working directory");
      expect(html).toContain("src/backend");
      expect(html).toContain("Local Development Mirror");
      expect(html).toContain("/dev/mirror");
      expect(html).toContain("Branch");
      expect(html).toContain("feature/test");
    });

    it("should show fallback labels when optional creation fields are empty", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

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
      expect(html).toContain("Local Development Mirror");
      expect(html).toContain("Disabled"); // fallback
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
        await bcrypt.hash("testpass", 10),
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
      expect(html).not.toContain("Idle Timeout"); // This is in runtime section, not creation

      // Verify runtime section with editable timeout exists
      expect(html).toContain("Idle Timeout");
      expect(html).toContain("select");
      expect(html).toContain("Update Settings");
    });
  });
});
