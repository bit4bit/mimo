import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import bcrypt from "bcrypt";

let agentRoutes: any;
let agentRepository: any;
let agentService: any;
let userRepository: any;
let projectRepository: any;
let sessionRepository: any;
let generateToken: any;

describe("Agent Lifecycle Integration Tests", () => {
  const testHome = join(tmpdir(), `mimo-agent-test-${Date.now()}`);

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

    const agentRepoModule = await import("../src/agents/repository.ts");
    agentRepository = agentRepoModule.agentRepository;

    const agentSvcModule = await import("../src/agents/service.ts");
    agentService = agentSvcModule.agentService;

    const jwtModule = await import("../src/auth/jwt.ts");
    generateToken = jwtModule.generateToken;

    const routesModule = await import("../src/agents/routes.tsx");
    agentRoutes = routesModule.default;
  });

  describe("Agent Creation", () => {
    it("should create agent record with JWT token", async () => {
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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      // Create agent via service (simulating what would happen via POST)
      const agent = await agentService.spawnAgent({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        agentPath: "echo", // Use echo as mock agent binary
      });

      expect(agent).toBeDefined();
      expect(agent.sessionId).toBe(session.id);
      expect(agent.projectId).toBe(project.id);
      expect(agent.owner).toBe("testuser");
      expect(agent.token).toBeDefined();
      expect(agent.status).toBe("starting");
    });

    it("should verify agent JWT token", async () => {
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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      const agent = await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "test-token",
      });

      const token = await agentService.generateAgentToken(agent);
      const payload = await agentService.verifyAgentToken(token);

      expect(payload).toBeDefined();
      expect(payload?.agentId).toBe(agent.id);
      expect(payload?.sessionId).toBe(session.id);
      expect(payload?.projectId).toBe(project.id);
      expect(payload?.owner).toBe("testuser");
    });

    it("should reject invalid agent token", async () => {
      const payload = await agentService.verifyAgentToken("invalid-token");
      expect(payload).toBeNull();
    });
  });

  describe("Agent Status Tracking", () => {
    it("should update agent status", async () => {
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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      const agent = await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "test-token",
      });

      // Update status to connected
      await agentRepository.updateStatus(agent.id, "connected");
      const updated = await agentRepository.findById(agent.id);
      expect(updated?.status).toBe("connected");

      // Update status to killed
      await agentRepository.updateStatus(agent.id, "killed");
      const killed = await agentRepository.findById(agent.id);
      expect(killed?.status).toBe("killed");
    });

    it("should list agents by owner", async () => {
      await userRepository.create("user1", await bcrypt.hash("pass1", 10));
      await userRepository.create("user2", await bcrypt.hash("pass2", 10));
      
      const project1 = await projectRepository.create({
        name: "Project 1",
        repoUrl: "https://github.com/user/repo1.git",
        repoType: "git",
        owner: "user1",
      });
      const session1 = await sessionRepository.create({
        name: "Session 1",
        projectId: project1.id,
        owner: "user1",
        worktreePath: join(testHome, "worktrees", "session1"),
      });

      const project2 = await projectRepository.create({
        name: "Project 2",
        repoUrl: "https://github.com/user/repo2.git",
        repoType: "git",
        owner: "user2",
      });
      const session2 = await sessionRepository.create({
        name: "Session 2",
        projectId: project2.id,
        owner: "user2",
        worktreePath: join(testHome, "worktrees", "session2"),
      });

      await agentRepository.create({
        sessionId: session1.id,
        projectId: project1.id,
        owner: "user1",
        token: "token1",
      });

      await agentRepository.create({
        sessionId: session2.id,
        projectId: project2.id,
        owner: "user2",
        token: "token2",
      });

      const user1Agents = await agentRepository.findByOwner("user1");
      expect(user1Agents.length).toBe(1);
      expect(user1Agents[0].owner).toBe("user1");

      const user2Agents = await agentRepository.findByOwner("user2");
      expect(user2Agents.length).toBe(1);
      expect(user2Agents[0].owner).toBe("user2");
    });

    it("should list agents by session", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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
        worktreePath: join(testHome, "worktrees", "session1"),
      });
      const session2 = await sessionRepository.create({
        name: "Session 2",
        projectId: project.id,
        owner: "testuser",
        worktreePath: join(testHome, "worktrees", "session2"),
      });

      await agentRepository.create({
        sessionId: session1.id,
        projectId: project.id,
        owner: "testuser",
        token: "token1",
      });

      await agentRepository.create({
        sessionId: session1.id,
        projectId: project.id,
        owner: "testuser",
        token: "token2",
      });

      await agentRepository.create({
        sessionId: session2.id,
        projectId: project.id,
        owner: "testuser",
        token: "token3",
      });

      const session1Agents = await agentRepository.findBySessionId(session1.id);
      expect(session1Agents.length).toBe(2);

      const session2Agents = await agentRepository.findBySessionId(session2.id);
      expect(session2Agents.length).toBe(1);
    });
  });

  describe("Agent Repository", () => {
    it("should store agent in filesystem", async () => {
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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      const agent = await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "test-token",
      });

      // Verify agent can be retrieved
      const retrieved = await agentRepository.findById(agent.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(agent.id);
      expect(retrieved?.sessionId).toBe(session.id);
    });

    it("should update agent with PID", async () => {
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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      const agent = await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "test-token",
      });

      await agentRepository.updatePid(agent.id, 12345);
      const updated = await agentRepository.findById(agent.id);
      expect(updated?.pid).toBe(12345);
    });

    it("should update last activity timestamp", async () => {
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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      const agent = await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "test-token",
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      await agentRepository.updateLastActivity(agent.id);
      const updated = await agentRepository.findById(agent.id);
      expect(updated?.lastActivityAt).toBeDefined();
      expect(new Date(updated?.lastActivityAt!).getTime()).toBeGreaterThan(
        new Date(agent.startedAt).getTime()
      );
    });

    it("should delete agent", async () => {
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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      const agent = await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "test-token",
      });

      expect(await agentRepository.exists(agent.id)).toBe(true);

      await agentRepository.delete(agent.id);

      expect(await agentRepository.exists(agent.id)).toBe(false);
    });
  });

  describe("Agent WebSocket Authentication", () => {
    it("should generate valid agent token with claims", async () => {
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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      const agent = await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "test-token",
      });

      const token = await agentService.generateAgentToken(agent);
      const payload = await agentService.verifyAgentToken(token);

      expect(payload).toBeDefined();
      expect(payload?.agentId).toBe(agent.id);
      expect(payload?.sessionId).toBe(session.id);
      expect(payload?.projectId).toBe(project.id);
      expect(payload?.owner).toBe("testuser");
    });

    it("should reject expired token", async () => {
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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      const agent = await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "test-token",
      });

      // Generate token that expired 1 second ago
      const { SignJWT } = await import("jose");
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const expiredToken = await new SignJWT({
        agentId: agent.id,
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("-1s") // Expired
        .sign(secret);

      const payload = await agentService.verifyAgentToken(expiredToken);
      expect(payload).toBeNull();
    });
  });

  describe("Agent Listing Page", () => {
    it("should show agents list page", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "test-token",
      });

      const token = await generateToken("testuser");

      const res = await app.request("/agents", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Agents");
    });

    it("should filter agents by status", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

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
        worktreePath: join(testHome, "worktrees", "test-session"),
      });

      await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "token1",
      });

      const agent2 = await agentRepository.create({
        sessionId: session.id,
        projectId: project.id,
        owner: "testuser",
        token: "token2",
      });
      await agentRepository.updateStatus(agent2.id, "connected");

      const token = await generateToken("testuser");

      // Filter by connected status
      const res = await app.request("/agents?status=connected", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("connected");
    });
  });
});
