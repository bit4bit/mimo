import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";

describe("Fossil Credential Provisioning Integration Tests", () => {
  let testHome: string;
  let VCS: any;
  let vcs: any;
  let fossilServerManager: any;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-credential-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    process.env.MIMO_HOME = testHome;
    
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
    
    mkdirSync(testHome, { recursive: true });

    const vcsModule = await import("../src/vcs/index.ts");
    VCS = vcsModule.VCS;
    vcs = new VCS();

    const serverModule = await import("../src/vcs/fossil-server.ts");
    fossilServerManager = serverModule.fossilServerManager;
  });

  afterEach(async () => {
    try {
      await fossilServerManager.stopAllServers();
    } catch {}
    
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  describe("createFossilUser", () => {
    it("should create a fossil user with DEV capabilities", async () => {
      const repoPath = join(testHome, "test-user.fossil");
      await vcs.createFossilRepo(repoPath);

      const result = await vcs.createFossilUser(repoPath, "test-agent", "testpass123");
      
      expect(result.success).toBe(true);

      // Verify user exists
      const usersOutput = execSync(`fossil user list -R ${repoPath}`).toString();
      expect(usersOutput).toContain("test-agent");

      // Verify capabilities (d=develop, i=check-in, o=check-out)
      const capsOutput = execSync(`fossil user capabilities test-agent -R ${repoPath}`).toString();
      expect(capsOutput).toContain("dio");
    });

    it("should fail for non-existent repository", async () => {
      const result = await vcs.createFossilUser(
        "/nonexistent/repo.fossil",
        "test-agent",
        "testpass123"
      );
      
      expect(result.success).toBe(false);
    });
  });

  describe("Agent Clone with Credentials", () => {
    it("should allow cloning with authenticated URL", async () => {
      const repoPath = join(testHome, "server.fossil");
      await vcs.createFossilRepo(repoPath);

      // Create agent user
      await vcs.createFossilUser(repoPath, "agent-test", "agentpass123");

      // Start fossil server
      const serverResult = await fossilServerManager.startServer("test-session", repoPath);
      expect(serverResult.port).toBeDefined();
      const port = serverResult.port;

      // Clone with credentials
      const checkoutDir = join(testHome, "checkout");
      mkdirSync(checkoutDir, { recursive: true });

      const cloneUrl = `http://agent-test:agentpass123@localhost:${port}/`;
      execSync(`fossil clone ${cloneUrl} ${join(checkoutDir, "repo.fossil")}`, { cwd: checkoutDir });

      // Verify clone succeeded
      expect(existsSync(join(checkoutDir, "repo.fossil"))).toBe(true);

      // Open checkout
      execSync(`fossil open --nosync repo.fossil`, { cwd: checkoutDir });

      // Set remote URL with credentials
      execSync(`fossil remote-url ${cloneUrl}`, { cwd: checkoutDir });

      // Set local password to match server
      execSync(`fossil user password agent-test agentpass123`, { cwd: checkoutDir });

      // Add named remote with credentials
      execSync(`fossil remote add server ${cloneUrl}`, { cwd: checkoutDir });

      // Verify sync works without password prompt
      const syncOutput = execSync(`fossil sync server`, { cwd: checkoutDir }).toString();
      expect(syncOutput).toContain("Sync done");

      await fossilServerManager.stopServer("test-session");
    }, 30000);

    it("should reject clone with wrong password", async () => {
      const repoPath = join(testHome, "server2.fossil");
      await vcs.createFossilRepo(repoPath);

      // Create agent user
      await vcs.createFossilUser(repoPath, "agent-test2", "correctpass123");

      // Start fossil server
      const serverResult = await fossilServerManager.startServer("test-session2", repoPath);
      const port = serverResult.port;

      // Try to clone with wrong password
      const checkoutDir = join(testHome, "checkout2");
      mkdirSync(checkoutDir, { recursive: true });

      const wrongCloneUrl = `http://agent-test2:wrongpass@localhost:${port}/`;
      
      let cloneFailed = false;
      try {
        execSync(`fossil clone ${wrongCloneUrl} ${join(checkoutDir, "repo.fossil")}`, { cwd: checkoutDir });
      } catch (error) {
        cloneFailed = true;
      }

      expect(cloneFailed).toBe(true);

      await fossilServerManager.stopServer("test-session2");
    }, 30000);

    it("should reject sync without proper credentials", async () => {
      const repoPath = join(testHome, "server3.fossil");
      await vcs.createFossilRepo(repoPath);

      // Create agent user with password
      await vcs.createFossilUser(repoPath, "agent-test3", "secretpass123");

      // Start fossil server
      const serverResult = await fossilServerManager.startServer("test-session3", repoPath);
      const port = serverResult.port;

      // Clone with correct credentials
      const checkoutDir = join(testHome, "checkout3");
      mkdirSync(checkoutDir, { recursive: true });

      const cloneUrl = `http://agent-test3:secretpass123@localhost:${port}/`;
      execSync(`fossil clone ${cloneUrl} ${join(checkoutDir, "repo.fossil")}`, { cwd: checkoutDir });
      
      // Open checkout
      execSync(`fossil open --nosync repo.fossil`, { cwd: checkoutDir });
      
      // Set local password (this works without server auth)
      execSync(`fossil user password agent-test3 secretpass123`, { cwd: checkoutDir });

      // Set remote URL without credentials - this requires the server password which we don't have cached yet
      let remoteUrlFailed = false;
      try {
        execSync(`fossil remote-url http://agent-test3@localhost:${port}/`, { cwd: checkoutDir });
      } catch (error) {
        remoteUrlFailed = true;
      }

      // Setting remote-url without credentials should fail
      expect(remoteUrlFailed).toBe(true);

      await fossilServerManager.stopServer("test-session3");
    }, 30000);
  });

  describe("Named Remote with Credentials", () => {
    it("should store credentials in named remote", async () => {
      const repoPath = join(testHome, "server4.fossil");
      await vcs.createFossilRepo(repoPath);

      // Create agent user
      await vcs.createFossilUser(repoPath, "agent-test4", "mypass456");

      // Start fossil server
      const serverResult = await fossilServerManager.startServer("test-session4", repoPath);
      const port = serverResult.port;

      // Setup checkout
      const checkoutDir = join(testHome, "checkout4");
      mkdirSync(checkoutDir, { recursive: true });

      const cloneUrl = `http://agent-test4:mypass456@localhost:${port}/`;
      execSync(`fossil clone ${cloneUrl} ${join(checkoutDir, "repo.fossil")}`, { cwd: checkoutDir });
      execSync(`fossil open --nosync repo.fossil`, { cwd: checkoutDir });
      execSync(`fossil remote-url ${cloneUrl}`, { cwd: checkoutDir });
      execSync(`fossil user password agent-test4 mypass456`, { cwd: checkoutDir });

      // Add named remote
      execSync(`fossil remote add myserver ${cloneUrl}`, { cwd: checkoutDir });

      // Verify named remote exists by listing all remotes
      const remoteListOutput = execSync(`fossil remote list`, { cwd: checkoutDir }).toString();
      expect(remoteListOutput).toContain("myserver");

      // Sync using named remote should work
      const syncOutput = execSync(`fossil sync myserver`, { cwd: checkoutDir }).toString();
      expect(syncOutput).toContain("Sync done");

      await fossilServerManager.stopServer("test-session4");
    }, 30000);
  });
});
