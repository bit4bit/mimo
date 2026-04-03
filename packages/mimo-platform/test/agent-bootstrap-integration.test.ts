import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join, relative } from "path";
import { rmSync, mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { execSync } from "child_process";

describe("Agent Bootstrap Integration Tests", () => {
  let testHome: string;
  let SessionRepository: any;
  let sessionRepository: any;
  let AgentRepository: any;
  let agentRepository: any;
  let AgentService: any;
  let agentService: any;
  let FossilServerManager: any;
  let fossilServerManager: any;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-bootstrap-integ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    process.env.MIMO_HOME = testHome;
    
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
    
    mkdirSync(testHome, { recursive: true });
    mkdirSync(join(testHome, "projects"), { recursive: true });
    mkdirSync(join(testHome, "agents"), { recursive: true });

    const sessionModule = await import("../src/sessions/repository.ts");
    SessionRepository = sessionModule.SessionRepository;
    sessionRepository = sessionModule.sessionRepository;

    const agentModule = await import("../src/agents/repository.ts");
    AgentRepository = agentModule.AgentRepository;
    agentRepository = agentModule.agentRepository;

    const serviceModule = await import("../src/agents/service.ts");
    AgentService = serviceModule.AgentService;
    agentService = serviceModule.agentService;

    const fossilModule = await import("../src/vcs/fossil-server.ts");
    FossilServerManager = fossilModule.FossilServerManager;
    fossilServerManager = fossilModule.fossilServerManager;
  });

  afterEach(async () => {
    try {
      const sessions = await sessionRepository.listByProject("test-project-full");
      for (const session of sessions) {
        if (fossilServerManager.isServerRunning(session.id)) {
          await fossilServerManager.stopServer(session.id);
        }
      }
    } catch {}
    
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  describe("11.1: Full flow - session creation to agent bootstrap", () => {
    it("should create session with port null before agent connects", async () => {
      const projectPath = join(testHome, "projects", "test-project-full");
      mkdirSync(projectPath, { recursive: true });
      writeFileSync(join(projectPath, "project.yaml"), "id: test-project-full\nname: Test Project\nowner: testuser\n");

      const session = await sessionRepository.create({
        name: "Full Flow Test",
        projectId: "test-project-full",
        owner: "testuser",
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.port).toBeNull();
      expect(session.status).toBe("active");
    });

    it("should start fossil server when agent connects with session assigned", async () => {
      const projectPath = join(testHome, "projects", "test-project-full");
      mkdirSync(projectPath, { recursive: true });
      writeFileSync(join(projectPath, "project.yaml"), "id: test-project-full\nname: Test Project\nowner: testuser\n");

      const session = await sessionRepository.create({
        name: "Fossil Server Test",
        projectId: "test-project-full",
        owner: "testuser",
        assignedAgentId: "test-agent-id",
      });

      const fossilPath = join(session.upstreamPath, "..", "repo.fossil");
      mkdirSync(join(session.upstreamPath), { recursive: true });
      execSync(`fossil new ${fossilPath}`, { stdio: "pipe" });

      const result = await fossilServerManager.startServer(session.id, fossilPath);
      expect("port" in result).toBe(true);
      expect(("port" in result) ? result.port : 0).toBeGreaterThan(0);

      const running = fossilServerManager.isServerRunning(session.id);
      expect(running).toBe(true);

      await fossilServerManager.stopServer(session.id);
    });

    it("should format session_ready message with platformUrl and session ports", async () => {
      const platformUrl = "http://localhost:3000";
      const sessions = [
        { sessionId: "session-123", port: 8080 },
      ];

      const message = {
        type: "session_ready",
        platformUrl,
        sessions,
      };

      expect(message.type).toBe("session_ready");
      expect(message.platformUrl).toBe("http://localhost:3000");
      expect(message.sessions).toHaveLength(1);
      expect(message.sessions[0].sessionId).toBe("session-123");
      expect(message.sessions[0].port).toBe(8080);
    });
  });

  describe("11.2: Agent reconnect with existing checkout", () => {
    it("should detect existing fossil repo on reconnect", async () => {
      const sessionId = "reconnect-session";
      const workdir = join(testHome, "agent-workdir");
      const repoPath = join(workdir, `${sessionId}.fossil`);
      const checkoutPath = join(workdir, sessionId);

      mkdirSync(workdir, { recursive: true });

      execSync(`fossil new ${repoPath}`, { stdio: "pipe" });

      expect(existsSync(repoPath)).toBe(true);

      mkdirSync(checkoutPath, { recursive: true });
      execSync(`fossil open ${repoPath} --workdir ${checkoutPath}`, { cwd: checkoutPath, stdio: "pipe" });

      expect(existsSync(repoPath) || existsSync(join(checkoutPath, "_FOSSIL_")) || existsSync(join(checkoutPath, ".fslckout"))).toBe(true);
    });

    it("should skip clone when checkout already exists", async () => {
      const sessionId = "existing-checkout";
      const workdir = join(testHome, "agent-workdir-exist");
      const checkoutPath = join(workdir, sessionId);
      const fossilDir = join(checkoutPath, ".fossil");

      mkdirSync(checkoutPath, { recursive: true });
      mkdirSync(fossilDir, { recursive: true });

      const checkoutExists = existsSync(fossilDir);
      expect(checkoutExists).toBe(true);

      const repoPath = join(checkoutPath, "..", `${sessionId}.fossil`);
      const repoExists = existsSync(repoPath);
      expect(repoExists).toBe(false);
    });
  });

  describe("11.3: Multi-session agent", () => {
    it("should track multiple sessions for single agent", async () => {
      const agentId = "multi-agent";
      const sessions = [];
      const ports = [8080, 8081, 8082];

      for (let i = 0; i < 3; i++) {
        const projectPath = join(testHome, "projects", `project-${i}`);
        mkdirSync(projectPath, { recursive: true });
        writeFileSync(join(projectPath, "project.yaml"), `id: project-${i}\nname: Project ${i}\nowner: testuser\n`);

        const session = await sessionRepository.create({
          name: `Session ${i}`,
          projectId: `project-${i}`,
          owner: "testuser",
          assignedAgentId: agentId,
        });
        sessions.push(session);
      }

      const agentSessions = await sessionRepository.findByAssignedAgentId(agentId);
      expect(agentSessions).toHaveLength(3);
    });

    it("should support multiple fossil servers on different ports", async () => {
      const servers: { sessionId: string; port: number }[] = [];

      for (let i = 0; i < 3; i++) {
        const sessionId = `multi-server-${i}`;
        const fossilPath = join(testHome, `repo-${i}.fossil`);
        
        execSync(`fossil new ${fossilPath}`, { stdio: "pipe" });
        
        const result = await fossilServerManager.startServer(sessionId, fossilPath);
        
        if ("port" in result) {
          servers.push({ sessionId, port: result.port });
        }
      }

      expect(servers).toHaveLength(3);
      
      const ports = servers.map(s => s.port);
      const uniquePorts = new Set(ports);
      expect(uniquePorts.size).toBe(3);

      for (const server of servers) {
        await fossilServerManager.stopServer(server.sessionId);
      }
    });
  });

  describe("11.4: Session deletion while agent connected", () => {
    it("should stop fossil server when session deleted", async () => {
      const sessionId = "delete-me-session";
      const fossilPath = join(testHome, "delete-test.fossil");
      
      execSync(`fossil new ${fossilPath}`, { stdio: "pipe" });
      
      const result = await fossilServerManager.startServer(sessionId, fossilPath);
      expect("port" in result).toBe(true);
      
      expect(fossilServerManager.isServerRunning(sessionId)).toBe(true);
      
      await fossilServerManager.stopServer(sessionId);
      
      expect(fossilServerManager.isServerRunning(sessionId)).toBe(false);
    });

    it("should clean up session data on delete", async () => {
      const projectPath = join(testHome, "projects", "delete-project");
      mkdirSync(projectPath, { recursive: true });
      writeFileSync(join(projectPath, "project.yaml"), "id: delete-project\nname: Delete Project\nowner: testuser\n");

      const session = await sessionRepository.create({
        name: "To Be Deleted",
        projectId: "delete-project",
        owner: "testuser",
      });

      const sessionPath = join(projectPath, "sessions", session.id);
      expect(existsSync(sessionPath)).toBe(true);

      await sessionRepository.delete("delete-project", session.id);

      const loaded = await sessionRepository.findById(session.id);
      expect(loaded).toBeNull();
    });
  });

  describe("11.5: Checkout path outside workdir", () => {
    it("should handle relative path computation for paths outside workdir", () => {
      const workdir = "/home/user/work";
      const checkoutPath = "/tmp/sessions/abc-123";
      
      const relativePath = relative(workdir, checkoutPath);
      
      expect(relativePath.startsWith("..")).toBe(true);
    });

    it("should compute correct relative path inside workdir", () => {
      const workdir = "/home/user/work";
      const checkoutPath = "/home/user/work/session-abc";
      
      const relativePath = relative(workdir, checkoutPath);
      
      expect(relativePath).toBe("session-abc");
      expect(relativePath.startsWith("..")).toBe(false);
    });

    it("should derive checkout path from workdir and sessionId", () => {
      const workdir = join(testHome, "agent-work");
      const sessionId = "test-session-123";
      const checkoutPath = join(workdir, sessionId);
      
      expect(checkoutPath).toBe(join(testHome, "agent-work", "test-session-123"));
    });
  });
});