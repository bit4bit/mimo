import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync } from "fs";
import bcrypt from "bcrypt";

describe("Session Fossil Port Race Condition", () => {
  let testHome: string;
  let sessionRoutes: any;
  let sessionRepository: any;
  let userRepository: any;
  let projectRepository: any;
  let generateToken: any;
  let fossilServerManager: any;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-fossil-port-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    process.env.MIMO_HOME = testHome;
    process.env.JWT_SECRET = "test-secret-key-for-testing";

    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });

    // Import modules
    const pathsModule = await import("../src/config/paths.ts");
    pathsModule.ensureMimoHome();

    const userModule = await import("../src/auth/user.ts");
    userRepository = userModule.userRepository;

    const projectModule = await import("../src/projects/repository.ts");
    projectRepository = projectModule.projectRepository;

    const sessionModule = await import("../src/sessions/repository.ts");
    sessionRepository = sessionModule.sessionRepository;

    const jwtModule = await import("../src/auth/jwt.ts");
    generateToken = jwtModule.generateToken;

    const serverModule = await import("../src/vcs/fossil-server.ts");
    fossilServerManager = serverModule.fossilServerManager;

    // Mock VCS methods
    const vcsModule = await import("../src/vcs/index.ts");
    vcsModule.vcs.cloneRepository = async () => ({ success: true });
    vcsModule.vcs.importToFossil = async () => ({ success: true });
    vcsModule.vcs.openFossil = async () => ({ success: true });
    vcsModule.vcs.createFossilUser = async () => ({ success: true });

    const routesModule = await import("../src/sessions/routes.tsx");
    sessionRoutes = routesModule.default;
  });

  afterEach(async () => {
    // Stop all fossil servers
    try {
      await fossilServerManager.stopAllServers();
    } catch {}

    // Clean up test directory
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  describe("Session Detail Page - Fossil Port Display", () => {
    it("should show fossil URL immediately after session creation when server is running", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Setup user and project
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create session
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Create a fossil repo file to start server
      const fossilPath = `${session.upstreamPath}/../repo.fossil`;
      mkdirSync(session.upstreamPath, { recursive: true });
      const { execSync } = await import("child_process");
      execSync(`fossil init "${fossilPath}"`, { stdio: "pipe" });

      // Start fossil server for session (simulating what happens when agent connects)
      const result = await fossilServerManager.startServer(session.id, fossilPath);
      expect(result).toHaveProperty("port");
      const port = (result as { port: number }).port;

      // Update session with port (simulating what index.tsx does)
      await sessionRepository.update(session.id, { port });

      // Create token and request session detail page
      const token = await generateToken("testuser");
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(200);
      const html = await res.text();

      // The page should show fossil links, NOT "Fossil server not running"
      expect(html).not.toContain("Fossil server not running");
      expect(html).toContain(`http://localhost:${port}`);
      expect(html).toContain("Timeline");
      expect(html).toContain("Files");
    });

    it("should show 'Fossil server not running' when server has not been started", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Setup user and project
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create session WITHOUT starting fossil server (simulating race condition)
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });
      // session.port is null, server is not running

      // Create token and request session detail page immediately
      const token = await generateToken("testuser");
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(200);
      const html = await res.text();

      // The page should show "Fossil server not running" since server hasn't started
      expect(html).toContain("Fossil server not running");
    });

    it("should recover and show fossil URL after server is started and page is refreshed", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Setup user and project
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create session WITHOUT starting fossil server
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      // First request - server not running
      const token = await generateToken("testuser");
      const res1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res1.status).toBe(200);
      const html1 = await res1.text();
      expect(html1).toContain("Fossil server not running");

      // Now start the server (simulating agent connection)
      const fossilPath = `${session.upstreamPath}/../repo.fossil`;
      mkdirSync(session.upstreamPath, { recursive: true });
      const { execSync } = await import("child_process");
      execSync(`fossil init "${fossilPath}"`, { stdio: "pipe" });

      const result = await fossilServerManager.startServer(session.id, fossilPath);
      expect(result).toHaveProperty("port");
      const port = (result as { port: number }).port;

      await sessionRepository.update(session.id, { port });

      // Second request - server is now running
      const res2 = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res2.status).toBe(200);
      const html2 = await res2.text();

      // Should now show fossil URL
      expect(html2).not.toContain("Fossil server not running");
      expect(html2).toContain(`http://localhost:${port}`);
    });

    it("should use running server port over saved session port", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Setup user and project
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create session
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Create and start fossil server
      const fossilPath = `${session.upstreamPath}/../repo.fossil`;
      mkdirSync(session.upstreamPath, { recursive: true });
      const { execSync } = await import("child_process");
      execSync(`fossil init "${fossilPath}"`, { stdio: "pipe" });

      const result = await fossilServerManager.startServer(session.id, fossilPath);
      const port = (result as { port: number }).port;

      // Save port to session
      await sessionRepository.update(session.id, { port });

      // Request page - should use running server port
      const token = await generateToken("testuser");
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(200);
      const html = await res.text();

      // Should show fossil URL from running server
      expect(html).not.toContain("Fossil server not running");
      expect(html).toContain(`http://localhost:${port}`);
    });
  });

  describe("Fossil Status API", () => {
    it("should return running=true when fossil server is running", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Setup user and project
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create session
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Create and start fossil server
      const fossilPath = `${session.upstreamPath}/../repo.fossil`;
      mkdirSync(session.upstreamPath, { recursive: true });
      const { execSync } = await import("child_process");
      execSync(`fossil init "${fossilPath}"`, { stdio: "pipe" });

      const result = await fossilServerManager.startServer(session.id, fossilPath);
      const port = (result as { port: number }).port;
      await sessionRepository.update(session.id, { port });

      // Request fossil status
      const token = await generateToken("testuser");
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/fossil-status`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.running).toBe(true);
      expect(data.fossilUrl).toBe(`http://localhost:${port}`);
    });

    it("should return running=false when fossil server is not running", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Setup user and project
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create session WITHOUT starting fossil server
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Request fossil status
      const token = await generateToken("testuser");
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/fossil-status`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.running).toBe(false);
      expect(data.fossilUrl).toBeNull();
    });

    it("should return 401 when not authenticated", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Setup user and project
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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

      // Request without authentication
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/fossil-status`
      );

      expect(res.status).toBe(401);
    });

    it("should return 404 for non-existent session", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Setup user and project
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Request for non-existent session
      const token = await generateToken("testuser");
      const res = await app.request(
        `/projects/${project.id}/sessions/non-existent-id/fossil-status`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(404);
    });

    it("should use saved session port when server is not in memory", async () => {
      const app = new Hono();
      app.route("/projects/:projectId/sessions", sessionRoutes);

      // Setup user and project
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create session
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Create fossil server
      const fossilPath = `${session.upstreamPath}/../repo.fossil`;
      mkdirSync(session.upstreamPath, { recursive: true });
      const { execSync } = await import("child_process");
      execSync(`fossil init "${fossilPath}"`, { stdio: "pipe" });

      const result = await fossilServerManager.startServer(session.id, fossilPath);
      const port = (result as { port: number }).port;

      // Update session with port
      await sessionRepository.update(session.id, { port });

      // Stop the server (simulates server restart scenario)
      await fossilServerManager.stopServer(session.id);

      // Request fossil status - should still return port from saved session
      const token = await generateToken("testuser");
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/fossil-status`,
        {
          headers: { Cookie: `token=${token}` },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      // Should return saved port even though server is not in memory
      expect(data.running).toBe(true);
      expect(data.fossilUrl).toBe(`http://localhost:${port}`);
    });
  });
});
