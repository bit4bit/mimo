import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";
import bcrypt from "bcrypt";
import { Hono } from "hono";

describe("Agent Sessions API Integration Tests", () => {
  let testHome: string;
  let agentRoutes: any;
  let agentRepository: any;
  let agentService: any;
  let sessionRepository: any;
  let projectRepository: any;
  let userRepository: any;
  let generateToken: any;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-agent-sessions-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    process.env.MIMO_HOME = testHome;
    process.env.JWT_SECRET = "test-secret-key-for-testing";

    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });

    // Re-import to get fresh modules
    const pathsModule = await import("../src/config/paths.ts");
    pathsModule.ensureMimoHome();

    const userModule = await import("../src/auth/user.ts");
    userRepository = userModule.userRepository;

    const projectModule = await import("../src/projects/repository.ts");
    projectRepository = projectModule.projectRepository;

    const sessionModule = await import("../src/sessions/repository.ts");
    sessionRepository = sessionModule.sessionRepository;

    const agentRepoModule = await import("../src/agents/repository.ts");
    agentRepository = agentRepoModule.agentRepository;

    const agentServiceModule = await import("../src/agents/service.ts");
    agentService = agentServiceModule.agentService;

    const jwtModule = await import("../src/auth/jwt.ts");
    generateToken = jwtModule.generateToken;

    const routesModule = await import("../src/agents/routes.tsx");
    agentRoutes = routesModule.default;
  });

  describe("Agent Token Generation", () => {
    it("should generate token with only agentId and owner", async () => {
      const agent = await agentService.createAgent({ owner: "testuser" });
      
      // Verify token format
      const payload = await agentService.verifyAgentToken(agent.token);
      
      expect(payload).toBeDefined();
      expect(payload.agentId).toBe(agent.id);
      expect(payload.owner).toBe("testuser");
      // Should NOT have sessionId or projectId
      expect((payload as any).sessionId).toBeUndefined();
      expect((payload as any).projectId).toBeUndefined();
    });

    it("should reject invalid tokens", async () => {
      const payload = await agentService.verifyAgentToken("invalid-token");
      expect(payload).toBeNull();
    });
  });

  describe("Agent Session Assignment", () => {
    it("should assign session to agent", async () => {
      const agent = await agentRepository.create({ owner: "testuser" });
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

      // Assign session to agent
      const updated = await agentRepository.assignSession(agent.id, session.id);
      
      expect(updated).not.toBeNull();
      expect(updated?.sessionIds).toContain(session.id);
    });

    it("should allow multiple sessions per agent", async () => {
      const agent = await agentRepository.create({ owner: "testuser" });
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });
      const session1 = await sessionRepository.create({
        name: "Session 1",
        projectId: project.id,
        owner: "testuser",
      });
      const session2 = await sessionRepository.create({
        name: "Session 2",
        projectId: project.id,
        owner: "testuser",
      });

      await agentRepository.assignSession(agent.id, session1.id);
      await agentRepository.assignSession(agent.id, session2.id);

      const updated = await agentRepository.findById(agent.id);
      expect(updated?.sessionIds.length).toBe(2);
      expect(updated?.sessionIds).toContain(session1.id);
      expect(updated?.sessionIds).toContain(session2.id);
    });

    it("should unassign session from agent", async () => {
      const agent = await agentRepository.create({ owner: "testuser" });
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

      await agentRepository.assignSession(agent.id, session.id);
      await agentRepository.unassignSession(agent.id, session.id);

      const updated = await agentRepository.findById(agent.id);
      expect(updated?.sessionIds).not.toContain(session.id);
    });
  });

  describe("GET /api/agents/me/sessions", () => {
    it("should return sessions assigned to agent", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

      const agent = await agentService.createAgent({ owner: "testuser" });
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });
      const session = await sessionRepository.create({
        name: "Assigned Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Assign session to agent (both agent.sessionIds AND session.assignedAgentId)
      await agentRepository.setSessionAssignment(agent.id, session.id, sessionRepository);

      const res = await app.request("/agents/me/sessions", {
        headers: {
          Authorization: `Bearer ${agent.token}`,
        },
      });

      expect(res.status).toBe(200);
      const sessions = await res.json();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBe(1);
      expect(sessions[0].sessionId).toBe(session.id);
      expect(sessions[0].projectId).toBe(project.id);
      expect(sessions[0].sessionName).toBe("Assigned Session");
    });

    it("should return empty array when no sessions assigned", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

      const agent = await agentService.createAgent({ owner: "testuser" });

      const res = await app.request("/agents/me/sessions", {
        headers: {
          Authorization: `Bearer ${agent.token}`,
        },
      });

      expect(res.status).toBe(200);
      const sessions = await res.json();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBe(0);
    });

    it("should reject request without token", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

      const res = await app.request("/agents/me/sessions");

      expect(res.status).toBe(401);
      const error = await res.json();
      expect(error.error).toContain("Missing token");
    });

    it("should reject request with invalid token", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

      const res = await app.request("/agents/me/sessions", {
        headers: {
          Authorization: "Bearer invalid-token",
        },
      });

      expect(res.status).toBe(401);
      const error = await res.json();
      expect(error.error).toContain("Invalid token");
    });

    it("should include port if session has one", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

      const agent = await agentService.createAgent({ owner: "testuser" });
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });
      const session = await sessionRepository.create({
        name: "Port Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Assign session and set port
      await agentRepository.setSessionAssignment(agent.id, session.id, sessionRepository);
      await sessionRepository.update(session.id, { port: 8042 });

      const res = await app.request("/agents/me/sessions", {
        headers: {
          Authorization: `Bearer ${agent.token}`,
        },
      });

      expect(res.status).toBe(200);
      const sessions = await res.json();
      expect(sessions[0].port).toBe(8042);
    });
  });
});