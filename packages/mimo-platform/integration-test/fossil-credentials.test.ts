import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import {
  SharedFossilServer,
  normalizeSessionIdForFossil,
} from "../src/vcs/shared-fossil-server.js";

describe("Fossil Credential Provisioning Integration Tests", () => {
  let testHome: string;
  let VCS: any;
  let vcs: any;
  let sharedFossilServer: SharedFossilServer;
  let testPort: number;

  beforeEach(async () => {
    // Use a unique port for each test to avoid conflicts
    testPort = 28000 + Math.floor(Math.random() * 1000);

    testHome = join(
      tmpdir(),
      `mimo-credential-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    createMimoContext({
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

    const vcsModule = await import("../src/vcs/index.ts");
    VCS = vcsModule.VCS;
    vcs = new VCS();

    // Create fresh SharedFossilServer instance with test-specific port and reposDir via constructor
    const reposDir = join(testHome, "session-fossils");
    sharedFossilServer = new SharedFossilServer({ port: testPort, reposDir });
  });

  afterEach(async () => {
    try {
      await sharedFossilServer.stop();
    } catch {}

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  describe("createFossilUser", () => {
    it("should create a fossil user with DEV capabilities", async () => {
      const repoPath = join(testHome, "test-user.fossil");
      await vcs.createFossilRepo(repoPath);

      const result = await vcs.createFossilUser(
        repoPath,
        "test-agent",
        "testpass123",
      );

      expect(result.success).toBe(true);

      // Verify user exists
      const usersOutput = execSync(
        `fossil user list -R ${repoPath}`,
      ).toString();
      expect(usersOutput).toContain("test-agent");

      // Verify capabilities (d=develop, i=check-in, o=check-out)
      const capsOutput = execSync(
        `fossil user capabilities test-agent -R ${repoPath}`,
      ).toString();
      expect(capsOutput).toContain("dio");
    });

    it("should fail for non-existent repository", async () => {
      const result = await vcs.createFossilUser(
        "/nonexistent/repo.fossil",
        "test-agent",
        "testpass123",
      );

      expect(result.success).toBe(false);
    });
  });

  describe("Agent Clone with Credentials", () => {
    it("should allow cloning with authenticated URL", async () => {
      const sessionId =
        "test-session-" + Math.random().toString(36).slice(2, 8);
      const repoPath = sharedFossilServer.getFossilPath(sessionId);

      // Ensure repos directory exists and create repo
      mkdirSync(sharedFossilServer.getReposDir(), { recursive: true });
      await vcs.createFossilRepo(repoPath);

      // Create agent user
      await vcs.createFossilUser(repoPath, "agent-test", "agentpass123");

      // Start shared fossil server
      await sharedFossilServer.start();
      const port = sharedFossilServer.getPort();
      const normalizedSessionId = normalizeSessionIdForFossil(sessionId);

      // Wait for server to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Clone with credentials
      const checkoutDir = join(testHome, "checkout");
      mkdirSync(checkoutDir, { recursive: true });

      const cloneUrl = `http://agent-test:agentpass123@localhost:${port}/${normalizedSessionId}/`;
      execSync(`fossil clone ${cloneUrl} ${join(checkoutDir, "repo.fossil")}`, {
        cwd: checkoutDir,
      });

      // Verify clone succeeded
      expect(existsSync(join(checkoutDir, "repo.fossil"))).toBe(true);

      // Open checkout
      execSync(`fossil open --nosync repo.fossil`, { cwd: checkoutDir });

      // Set remote URL with credentials
      execSync(`fossil remote-url ${cloneUrl}`, { cwd: checkoutDir });

      // Set local password to match server
      execSync(`fossil user password agent-test agentpass123`, {
        cwd: checkoutDir,
      });

      // Add named remote with credentials
      execSync(`fossil remote add server ${cloneUrl}`, { cwd: checkoutDir });

      // Verify sync works without password prompt
      const syncOutput = execSync(`fossil sync server`, {
        cwd: checkoutDir,
      }).toString();
      expect(syncOutput).toContain("Sync done");
    }, 30000);

    it("should reject clone with wrong password", async () => {
      const sessionId =
        "test-session-" + Math.random().toString(36).slice(2, 8);
      const repoPath = sharedFossilServer.getFossilPath(sessionId);

      // Ensure repos directory exists and create repo
      mkdirSync(sharedFossilServer.getReposDir(), { recursive: true });
      await vcs.createFossilRepo(repoPath);

      // Create agent user
      await vcs.createFossilUser(repoPath, "agent-test2", "correctpass123");

      // Start shared fossil server
      await sharedFossilServer.start();
      const port = sharedFossilServer.getPort();
      const normalizedSessionId = normalizeSessionIdForFossil(sessionId);

      // Wait for server to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Try to clone with wrong password
      const checkoutDir = join(testHome, "checkout2");
      mkdirSync(checkoutDir, { recursive: true });

      const wrongCloneUrl = `http://agent-test2:wrongpass@localhost:${port}/${normalizedSessionId}/`;

      let cloneFailed = false;
      try {
        execSync(
          `fossil clone ${wrongCloneUrl} ${join(checkoutDir, "repo.fossil")}`,
          { cwd: checkoutDir },
        );
      } catch (error) {
        cloneFailed = true;
      }

      expect(cloneFailed).toBe(true);
    }, 30000);

    it("should reject sync without proper credentials", async () => {
      const sessionId =
        "test-session-" + Math.random().toString(36).slice(2, 8);
      const repoPath = sharedFossilServer.getFossilPath(sessionId);

      // Ensure repos directory exists and create repo
      mkdirSync(sharedFossilServer.getReposDir(), { recursive: true });
      await vcs.createFossilRepo(repoPath);

      // Create agent user with password
      await vcs.createFossilUser(repoPath, "agent-test3", "secretpass123");

      // Start shared fossil server
      await sharedFossilServer.start();
      const port = sharedFossilServer.getPort();
      const normalizedSessionId = normalizeSessionIdForFossil(sessionId);

      // Wait for server to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Clone with correct credentials
      const checkoutDir = join(testHome, "checkout3");
      mkdirSync(checkoutDir, { recursive: true });

      const cloneUrl = `http://agent-test3:secretpass123@localhost:${port}/${normalizedSessionId}/`;
      execSync(`fossil clone ${cloneUrl} ${join(checkoutDir, "repo.fossil")}`, {
        cwd: checkoutDir,
      });

      // Open checkout
      execSync(`fossil open --nosync repo.fossil`, { cwd: checkoutDir });

      // Set remote URL WITHOUT credentials
      const publicUrl = `http://localhost:${port}/${normalizedSessionId}/`;
      execSync(`fossil remote-url ${publicUrl}`, { cwd: checkoutDir });

      // Try sync without credentials - should fail
      let syncFailed = false;
      try {
        execSync(`fossil sync`, {
          cwd: checkoutDir,
          timeout: 5000,
        });
      } catch (error) {
        syncFailed = true;
      }

      expect(syncFailed).toBe(true);
    }, 30000);
  });

  describe("createFossilUserInRepo", () => {
    it("should create user directly in repository using remote-url", async () => {
      const sessionId =
        "test-session-" + Math.random().toString(36).slice(2, 8);
      const repoPath = sharedFossilServer.getFossilPath(sessionId);

      // Ensure repos directory exists and create repo
      mkdirSync(sharedFossilServer.getReposDir(), { recursive: true });
      await vcs.createFossilRepo(repoPath);

      // Create setup user first
      await vcs.createFossilUser(repoPath, "setup-user", "setuppass123");

      // Start shared fossil server
      await sharedFossilServer.start();
      const port = sharedFossilServer.getPort();
      const normalizedSessionId = normalizeSessionIdForFossil(sessionId);

      // Wait for server to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Use the remote command to create user
      const result = await vcs.createFossilUserInRepo(
        sessionId,
        "agent-remote",
        "remotepass123",
        port,
        "setup-user",
        "setuppass123",
      );

      expect(result.success).toBe(true);

      // Verify user was created by cloning with the new credentials
      const checkoutDir = join(testHome, "checkout-remote");
      mkdirSync(checkoutDir, { recursive: true });

      const cloneUrl = `http://agent-remote:remotepass123@localhost:${port}/${normalizedSessionId}/`;
      execSync(`fossil clone ${cloneUrl} ${join(checkoutDir, "repo.fossil")}`, {
        cwd: checkoutDir,
      });

      expect(existsSync(join(checkoutDir, "repo.fossil"))).toBe(true);
    }, 30000);

    it("should fail when using wrong setup credentials", async () => {
      const sessionId =
        "test-session-" + Math.random().toString(36).slice(2, 8);
      const repoPath = sharedFossilServer.getFossilPath(sessionId);

      // Ensure repos directory exists and create repo
      mkdirSync(sharedFossilServer.getReposDir(), { recursive: true });
      await vcs.createFossilRepo(repoPath);

      // Create setup user
      await vcs.createFossilUser(repoPath, "setup-user2", "correctpass123");

      // Start shared fossil server
      await sharedFossilServer.start();
      const port = sharedFossilServer.getPort();

      // Wait for server to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Try to create user with wrong setup credentials
      const result = await vcs.createFossilUserInRepo(
        sessionId,
        "new-agent",
        "newpass123",
        port,
        "setup-user2",
        "wrongpass",
      );

      expect(result.success).toBe(false);
    }, 30000);
  });
});
