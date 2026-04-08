import { describe, it, expect, beforeEach, jest } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import bcrypt from "bcrypt";

// Re-import modules after setting up environment
let sessionRoutes: any;
let sessionRepository: any;
let chatService: any;
let userRepository: any;
let projectRepository: any;
let generateToken: any;

describe("Session Management Integration Tests", () => {
  const testHome = join(tmpdir(), `mimo-session-test-${Date.now()}`);

  beforeEach(async () => {
    // Set up fresh environment
    process.env.MIMO_HOME = testHome;
    process.env.JWT_SECRET = "test-secret-key-for-testing";

    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    // Re-import to get fresh modules
    const pathsModule = await import("../src/config/paths.ts");
    pathsModule.ensureMimoHome();

    const userModule = await import("../src/auth/user.ts");
    userRepository = userModule.userRepository;

    const projectModule = await import("../src/projects/repository.ts");
    projectRepository = projectModule.projectRepository;

    const sessionModule = await import("../src/sessions/repository.ts");
    sessionRepository = sessionModule.sessionRepository;

    const chatModule = await import("../src/sessions/chat.ts");
    chatService = chatModule.chatService;

    const jwtModule = await import("../src/auth/jwt.ts");
    generateToken = jwtModule.generateToken;

    // Mock VCS methods to avoid actual git/fossil operations in these tests
    const vcsModule = await import("../src/vcs/index.ts");
    vcsModule.vcs.cloneRepository = async () => ({ success: true });
    vcsModule.vcs.importToFossil = async () => ({ success: true });
    vcsModule.vcs.openFossilCheckout = async () => ({ success: true });
    vcsModule.vcs.openFossil = async () => ({ success: true });

    const routesModule = await import("../src/sessions/routes.tsx");
    sessionRoutes = routesModule.default;
  });

  describe("Session Creation", () => {
    it("should create a new session for a project", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Create user and project
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const token = await generateToken("testuser");

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
        /^\/projects\/[^\/]+\/sessions\/[^\/]+$/
      );

      // Verify session was created
      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(1);
      expect(sessions[0].name).toBe("Feature Branch Session");
    });

    it("should reject session creation without name", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const token = await generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams().toString(),
      });

      expect(res.status).toBe(400);
    });

    it("should create session with upstream and checkout directories", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const token = await generateToken("testuser");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({ name: "Test Session" }).toString(),
      });

      expect(res.status).toBe(302);

      // Get session from location header
      const location = res.headers.get("location") || "";
      const sessionId = location.split("/").pop();
      const session = await sessionRepository.findById(sessionId!);

      expect(session).not.toBeNull();
      expect(session?.agentWorkspacePath).toBeDefined();
      expect(session?.upstreamPath).toBeDefined();
    });
  });

  describe("Session Listing", () => {
    it("should list all sessions for a project", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create sessions (worktreePath is no longer needed, dirs created automatically)
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

      const token = await generateToken("testuser");

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

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const token = await generateToken("testuser");

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

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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

      const token = await generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      // Three-buffer layout elements
      expect(html).toContain("Files");
      expect(html).toContain("Chat");
      expect(html).toContain("Changes");
    });

    it("should return 404 for non-existent session", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const token = await generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/non-existent-id`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe("Session Deletion", () => {
    it("should delete session with cleanup", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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

      // Create checkout directory (simulating repository setup)
      mkdirSync(session.agentWorkspacePath, { recursive: true });
      expect(existsSync(session.agentWorkspacePath)).toBe(true);

      const token = await generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/delete`,
        {
          method: "POST",
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain(`/projects/${project.id}`);

      // Verify session and directories were deleted
      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(0);
      expect(existsSync(session.agentWorkspacePath)).toBe(false);
    });

    it("should cleanup resources when deleting session with assigned agent", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Create agent module mock
      const agentModule = await import("../src/agents/repository.ts");
      const agentServiceModule = await import("../src/agents/service.ts");
      const agentService = agentServiceModule.agentService;

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create agent first
      const agent = await agentService.createAgent({ owner: "testuser" });

      const session = await sessionRepository.create({
        name: "Session With Agent",
        projectId: project.id,
        owner: "testuser",
        assignedAgentId: agent.id,
      });

      // Create checkout directory
      mkdirSync(session.agentWorkspacePath, { recursive: true });

      const token = await generateToken("testuser");

      // Delete should succeed even with assigned agent
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/delete`,
        {
          method: "POST",
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(302);

      // Verify session deleted
      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(0);
    });

    it("should delete session without agent without errors", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepository.create({
        name: "Session No Agent",
        projectId: project.id,
        owner: "testuser",
        // No assignedAgentId
      });

      // Create checkout directory
      mkdirSync(session.agentWorkspacePath, { recursive: true });

      const token = await generateToken("testuser");

      // Delete should succeed without agent
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/delete`,
        {
          method: "POST",
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(302);

      // Verify session deleted
      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(0);
    });
  });

  describe("Chat History", () => {
    it("should save chat message to JSONL", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepository.create({
        name: "Chat Session",
        projectId: project.id,
        owner: "testuser",
      });

      const token = await generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `token=${token}`,
          },
          body: new URLSearchParams({ message: "Hello, agent!" }).toString(),
        }
      );

      expect(res.status).toBe(200);

      // Verify message was saved
      const messages = await chatService.loadHistory(session.id);
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe("Hello, agent!");
      expect(messages[0].role).toBe("user");
    });

    it("should load chat history", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepository.create({
        name: "History Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Add messages directly
      await chatService.saveMessage(session.id, {
        role: "user",
        content: "Question 1",
        timestamp: new Date().toISOString(),
      });

      await chatService.saveMessage(session.id, {
        role: "assistant",
        content: "Answer 1",
        timestamp: new Date().toISOString(),
      });

      const token = await generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Question 1");
      expect(html).toContain("Answer 1");
    });
  });

  describe("File Tree", () => {
    it("should show file tree with change indicators", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepository.create({
        name: "File Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Create some files in checkout
      mkdirSync(join(session.agentWorkspacePath, "src"), { recursive: true });
      writeFileSync(join(session.agentWorkspacePath, "README.md"), "# Project");
      writeFileSync(join(session.agentWorkspacePath, "src", "index.ts"), "// code");

      const token = await generateToken("testuser");

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/files`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("README.md");
      expect(html).toContain("src");
    });
  });

  describe("Local Development Mirror", () => {
    it("should create session with mirror path from project default", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        defaultLocalDevMirrorPath: "/home/user/dev/myproject",
      });

      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "Mirror Session");
      formData.append("localDevMirrorPath", "/home/user/dev/myproject");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      // Verify session was created with mirror path
      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(1);
      expect(sessions[0].localDevMirrorPath).toBe("/home/user/dev/myproject");
    });

    it("should create session with custom mirror path override", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        defaultLocalDevMirrorPath: "/home/user/dev/myproject",
      });

      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "Custom Mirror Session");
      formData.append("localDevMirrorPath", "/home/user/custom/path");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(1);
      expect(sessions[0].localDevMirrorPath).toBe("/home/user/custom/path");
    });

    it("should create session without mirror path when cleared", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        defaultLocalDevMirrorPath: "/home/user/dev/myproject",
      });

      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "No Mirror Session");
      formData.append("localDevMirrorPath", "");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(1);
      expect(sessions[0].localDevMirrorPath).toBeUndefined();
    });

    it("should create session without mirror path when project has none", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "No Project Mirror Session");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const sessions = await sessionRepository.listByProject(project.id);
      expect(sessions.length).toBe(1);
      expect(sessions[0].localDevMirrorPath).toBeUndefined();
    });
  });
});
