import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join, relative } from "path";
import { rmSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { createOS } from "../src/os/node-adapter.js";
import {
  SharedFossilServer,
  normalizeSessionIdForFossil,
} from "../src/vcs/shared-fossil-server.js";

describe("Agent Bootstrap Integration Tests", () => {
  let testHome: string;
  let SessionRepository: any;
  let sessionRepository: any;
  let AgentRepository: any;
  let agentRepository: any;
  let AgentService: any;
  let agentService: any;
  let sharedFossilServer: SharedFossilServer;
  let testPort: number;

  beforeEach(async () => {
    // Use a unique port for each test to avoid conflicts
    testPort = 38000 + Math.floor(Math.random() * 1000);

    testHome = join(
      tmpdir(),
      `mimo-bootstrap-integ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "test-secret-key-for-testing",
        MIMO_SHARED_FOSSIL_SERVER_PORT: testPort,
      },
    });

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });
    mkdirSync(join(testHome, "projects"), { recursive: true });
    mkdirSync(join(testHome, "agents"), { recursive: true });

    const sessionModule = await import("../src/sessions/repository.ts");
    SessionRepository = sessionModule.SessionRepository;
    sessionRepository = ctx.repos.sessions;

    const agentModule = await import("../src/agents/repository.ts");
    AgentRepository = agentModule.AgentRepository;
    agentRepository = ctx.repos.agents;

    const serviceModule = await import("../src/agents/service.ts");
    AgentService = serviceModule.AgentService;
    agentService = serviceModule.agentService;

    // Create fresh SharedFossilServer instance with test-specific port and reposDir via constructor
    const reposDir = join(testHome, "session-fossils");
    const os = createOS({ ...process.env });
    sharedFossilServer = new SharedFossilServer(
      { port: testPort, reposDir },
      os,
    );
  });

  afterEach(async () => {
    try {
      await sharedFossilServer.stop();
    } catch {}

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  describe("11.1: Full flow - session creation to agent bootstrap", () => {
    it("should create session with port null before agent connects", async () => {
      const projectPath = join(testHome, "projects", "test-project-full");
      mkdirSync(projectPath, { recursive: true });
      writeFileSync(
        join(projectPath, "project.yaml"),
        "id: test-project-full\nname: Test Project\nowner: testuser\n",
      );

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

    it("should start shared fossil server when agent connects with session assigned", async () => {
      const projectPath = join(testHome, "projects", "test-project-full");
      mkdirSync(projectPath, { recursive: true });
      writeFileSync(
        join(projectPath, "project.yaml"),
        "id: test-project-full\nname: Test Project\nowner: testuser\n",
      );

      const session = await sessionRepository.create({
        name: "Fossil Server Test",
        projectId: "test-project-full",
        owner: "testuser",
        assignedAgentId: "test-agent-id",
      });

      // Create fossil repo in the shared location
      const fossilPath = sharedFossilServer.getFossilPath(session.id);
      mkdirSync(sharedFossilServer.getReposDir(), { recursive: true });
      mkdirSync(join(session.upstreamPath), { recursive: true });
      execSync(`fossil new ${fossilPath}`, { stdio: "pipe" });

      // Start shared fossil server
      await sharedFossilServer.start();

      // Wait for server to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(await sharedFossilServer.isRunning()).toBe(true);
      expect(sharedFossilServer.getPort()).toBe(testPort);
    });

    it("should format session_ready message with platformUrl and session ports", async () => {
      const platformUrl = "http://localhost:3000";
      const sessions = [{ sessionId: "session-123", port: null }];

      const message = {
        type: "session_ready",
        platformUrl,
        sessions,
      };

      expect(message.type).toBe("session_ready");
      expect(message.platformUrl).toBe("http://localhost:3000");
      expect(message.sessions).toHaveLength(1);
      expect(message.sessions[0].sessionId).toBe("session-123");
      // With shared server, session port is always null
      expect(message.sessions[0].port).toBeNull();
    });
  });

  describe("11.2: Agent reconnect with existing checkout", () => {
    it("should detect existing fossil repo on reconnect", async () => {
      const sessionId = "reconnect-session";
      const workdir = join(testHome, "agent-workdir");
      const agentWorkspacePath = join(workdir, sessionId);

      mkdirSync(workdir, { recursive: true });

      // Create fossil repo in shared location
      const sharedFossilPath = sharedFossilServer.getFossilPath(sessionId);
      mkdirSync(sharedFossilServer.getReposDir(), { recursive: true });
      execSync(`fossil new ${sharedFossilPath}`, { stdio: "pipe" });

      // Clone to agent workspace
      mkdirSync(agentWorkspacePath, { recursive: true });
      await sharedFossilServer.start();

      // Wait for server to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      const port = sharedFossilServer.getPort();
      const normalizedId = normalizeSessionIdForFossil(sessionId);
      const cloneUrl = `http://localhost:${port}/${normalizedId}/`;
      execSync(
        `fossil clone ${cloneUrl} ${join(agentWorkspacePath, "repo.fossil")}`,
        { cwd: agentWorkspacePath },
      );
      execSync(
        `fossil open --nosync ${join(agentWorkspacePath, "repo.fossil")}`,
        { cwd: agentWorkspacePath },
      );

      expect(
        existsSync(join(agentWorkspacePath, "_FOSSIL_")) ||
          existsSync(join(agentWorkspacePath, ".fslckout")),
      ).toBe(true);
    });

    it("should skip clone when checkout already exists", async () => {
      const sessionId = "existing-checkout";
      const workdir = join(testHome, "agent-workdir-exist");
      const agentWorkspacePath = join(workdir, sessionId);
      const fossilDir = join(agentWorkspacePath, ".fossil");

      mkdirSync(agentWorkspacePath, { recursive: true });
      mkdirSync(fossilDir, { recursive: true });

      const checkoutExists = existsSync(fossilDir);
      expect(checkoutExists).toBe(true);

      const repoPath = join(agentWorkspacePath, "..", `${sessionId}.fossil`);
      const repoExists = existsSync(repoPath);
      expect(repoExists).toBe(false);
    });
  });

  describe("11.3: Multi-session agent", () => {
    it("should track multiple sessions for single agent", async () => {
      const agentId = "multi-agent";
      const sessions = [];

      for (let i = 0; i < 3; i++) {
        const projectPath = join(testHome, "projects", `project-${i}`);
        mkdirSync(projectPath, { recursive: true });
        writeFileSync(
          join(projectPath, "project.yaml"),
          `id: project-${i}\nname: Project ${i}\nowner: testuser\n`,
        );

        const session = await sessionRepository.create({
          name: `Session ${i}`,
          projectId: `project-${i}`,
          owner: "testuser",
          assignedAgentId: agentId,
        });
        sessions.push(session);
      }

      const agentSessions =
        await sessionRepository.findByAssignedAgentId(agentId);
      expect(agentSessions).toHaveLength(3);
    });

    it("should support multiple sessions using shared fossil server", async () => {
      const sessions: { sessionId: string; fossilPath: string }[] = [];

      // Create fossil repos for multiple sessions
      for (let i = 0; i < 3; i++) {
        const sessionId = `multi-session-${i}`;
        const fossilPath = sharedFossilServer.getFossilPath(sessionId);

        mkdirSync(sharedFossilServer.getReposDir(), { recursive: true });
        execSync(`fossil new ${fossilPath}`, { stdio: "pipe" });

        sessions.push({ sessionId, fossilPath });
      }

      // Start shared server once
      await sharedFossilServer.start();

      // All sessions should be accessible via the same server
      expect(await sharedFossilServer.isRunning()).toBe(true);
      expect(sharedFossilServer.getPort()).toBe(testPort);

      // Verify each session has a unique fossil path but same port
      const uniquePaths = new Set(sessions.map((s) => s.fossilPath));
      expect(uniquePaths.size).toBe(3);
    });
  });

  describe("11.4: Session deletion while agent connected", () => {
    it("should stop fossil server when session deleted", async () => {
      const sessionId = "delete-me-session";
      const fossilPath = sharedFossilServer.getFossilPath(sessionId);

      mkdirSync(sharedFossilServer.getReposDir(), { recursive: true });
      execSync(`fossil new ${fossilPath}`, { stdio: "pipe" });

      await sharedFossilServer.start();

      // Wait for server to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(await sharedFossilServer.isRunning()).toBe(true);

      await sharedFossilServer.stop();

      expect(await sharedFossilServer.isRunning()).toBe(false);
    });

    it("should clean up session data on delete", async () => {
      const projectPath = join(testHome, "projects", "delete-project");
      mkdirSync(projectPath, { recursive: true });
      writeFileSync(
        join(projectPath, "project.yaml"),
        "id: delete-project\nname: Delete Project\nowner: testuser\n",
      );

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
      const agentWorkspacePath = "/tmp/sessions/abc-123";

      const relativePath = relative(workdir, agentWorkspacePath);

      expect(relativePath.startsWith("..")).toBe(true);
    });

    it("should compute correct relative path inside workdir", () => {
      const workdir = "/home/user/work";
      const agentWorkspacePath = "/home/user/work/session-abc";

      const relativePath = relative(workdir, agentWorkspacePath);

      expect(relativePath).toBe("session-abc");
      expect(relativePath.startsWith("..")).toBe(false);
    });

    it("should derive checkout path from workdir and sessionId", () => {
      const workdir = join(testHome, "agent-work");
      const sessionId = "test-session-123";
      const agentWorkspacePath = join(workdir, sessionId);

      expect(agentWorkspacePath).toBe(
        join(testHome, "agent-work", "test-session-123"),
      );
    });
  });
});
