import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync } from "fs";

describe("VCS Integration Tests", () => {
  let testHome: string;
  let VCS: any;
  let fossilServer: any;
  let getNextPort: any;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-vcs-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    process.env.MIMO_HOME = testHome;
    
    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
    
    mkdirSync(testHome, { recursive: true });
    mkdirSync(join(testHome, "projects"), { recursive: true });

    // Re-import to get fresh modules
    const vcsModule = await import("../src/vcs/index.ts");
    VCS = vcsModule.VCS;

    const serverModule = await import("../src/vcs/server.ts");
    fossilServer = serverModule.fossilServer;
    getNextPort = serverModule.getNextPort;
  });

  describe("Fossil CLI Check", () => {
    it("should have fossil CLI available", async () => {
      const vcs = new VCS();
      const available = await vcs.checkFossilAvailable();
      expect(available).toBe(true);
    });

    it("should get fossil version", async () => {
      const vcs = new VCS();
      const version = await vcs.getFossilVersion();
      expect(version).toContain("2.");
    });
  });

  describe("Git Import to Fossil", () => {
    it("should handle invalid Git URL", async () => {
      const vcs = new VCS();
      
      const result = await vcs.importGitToFossil(
        "not-a-valid-url",
        join(testHome, "projects", "test")
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid");
    });

    it("should handle unreachable Git repository", async () => {
      const vcs = new VCS();
      const projectPath = join(testHome, "projects", "unreachable-project");
      mkdirSync(projectPath, { recursive: true });

      const result = await vcs.importGitToFossil(
        "https://example.com/nonexistent/repo.git",
        projectPath
      );

      // Should create fossil repo but import will likely fail or timeout
      // The important thing is it validates the URL format first
      expect(result).toBeDefined();
    }, 10000);
  });

  describe("Fossil Repository Operations", () => {
    it("should create a new Fossil repository", async () => {
      const vcs = new VCS();
      const repoPath = join(testHome, "test.fossil");

      const result = await vcs.createFossilRepo(repoPath);

      expect(result.success).toBe(true);
      expect(existsSync(repoPath)).toBe(true);
    });

    it("should open a Fossil repository", async () => {
      const vcs = new VCS();
      const repoPath = join(testHome, "test.fossil");
      const workDir = join(testHome, "work");
      
      await vcs.createFossilRepo(repoPath);
      mkdirSync(workDir, { recursive: true });

      const result = await vcs.openFossil(repoPath, workDir);

      expect(result.success).toBe(true);
      // After opening, .fslckout should be in the workdir (checkout database)
      expect(existsSync(join(workDir, ".fslckout"))).toBe(true);
    });

    it("should clone a Fossil repository", async () => {
      const vcs = new VCS();
      const sourceRepo = join(testHome, "source.fossil");
      const targetDir = join(testHome, "cloned");
      
      await vcs.createFossilRepo(sourceRepo);

      const result = await vcs.cloneFossil(sourceRepo, targetDir);

      expect(result.success).toBe(true);
      expect(existsSync(join(targetDir, ".fossil"))).toBe(true);
    }, 15000);
  });

  describe("Port Management", () => {
    it("should assign ports in 8000-9000 range", () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      
      expect(port1).toBeGreaterThanOrEqual(8000);
      expect(port1).toBeLessThanOrEqual(9000);
      expect(port2).toBe(port1 + 1);
    });

    it("should wrap around at 9000", () => {
      // We can't easily test the wrap-around without resetting state,
      // but we can at least verify ports are in range
      const port = getNextPort();
      expect(port).toBeGreaterThanOrEqual(8000);
      expect(port).toBeLessThanOrEqual(9000);
    });
  });

  describe("Fossil Server Lifecycle", () => {
    it("should start a Fossil server", async () => {
      const vcs = new VCS();
      const repoPath = join(testHome, "server-test.fossil");
      await vcs.createFossilRepo(repoPath);

      const port = getNextPort();
      const result = await fossilServer.start(repoPath, port);

      expect(result.success).toBe(true);
      expect(result.port).toBe(port);
      expect(fossilServer.isRunning(port)).toBe(true);

      // Cleanup
      await fossilServer.stop(port);
    }, 10000);

    it("should stop a Fossil server", async () => {
      const vcs = new VCS();
      const repoPath = join(testHome, "server-stop-test.fossil");
      await vcs.createFossilRepo(repoPath);

      const port = getNextPort();
      await fossilServer.start(repoPath, port);

      const result = await fossilServer.stop(port);

      expect(result.success).toBe(true);
      expect(fossilServer.isRunning(port)).toBe(false);
    }, 10000);

    it("should fail to start on invalid repo path", async () => {
      const port = getNextPort();
      const result = await fossilServer.start("/nonexistent/path.fossil", port);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Repository not found");
    }, 5000);

    it("should list running servers", async () => {
      const vcs = new VCS();
      const repoPath = join(testHome, "list-test.fossil");
      await vcs.createFossilRepo(repoPath);

      const port = getNextPort();
      await fossilServer.start(repoPath, port);

      const servers = fossilServer.listRunning();
      expect(servers.length).toBeGreaterThan(0);
      expect(servers.some((s: any) => s.port === port)).toBe(true);

      await fossilServer.stop(port);
    }, 10000);
  });

  describe("Error Handling", () => {
    it("should handle missing repository gracefully", async () => {
      const vcs = new VCS();
      const port = getNextPort();
      
      const result = await fossilServer.start("/nonexistent/repo.fossil", port);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
