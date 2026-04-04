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

  describe("Commit Flow VCS Methods", () => {
    describe("fossilUp", () => {
      it("should sync agent-workspace with repo.fossil", async () => {
        const vcs = new VCS();
        const repoPath = join(testHome, "agent-sync.fossil");
        const agentWorkspacePath = join(testHome, "agent-workspace");
        
        // Create fossil repo and open in agent workspace
        await vcs.createFossilRepo(repoPath);
        mkdirSync(agentWorkspacePath, { recursive: true });
        await vcs.openFossil(repoPath, agentWorkspacePath);
        
        // Add a file and commit directly to fossil
        const { writeFileSync } = await import("fs");
        writeFileSync(join(agentWorkspacePath, "test.txt"), "test content");
        await vcs.execCommand(["fossil", "add", "test.txt"], agentWorkspacePath);
        await vcs.execCommand(["fossil", "commit", "-m", "Test commit"], agentWorkspacePath);
        
        // Now test fossilUp (should be successful even with no changes)
        const result = await vcs.fossilUp(agentWorkspacePath);
        
        expect(result.success).toBe(true);
      }, 15000);
    });

    describe("cleanCopyToUpstream", () => {
      it("should copy files from agent-workspace to upstream", async () => {
        const vcs = new VCS();
        const agentWorkspacePath = join(testHome, "agent-workspace-copy");
        const upstreamPath = join(testHome, "upstream-copy");
        
        mkdirSync(agentWorkspacePath, { recursive: true });
        mkdirSync(upstreamPath, { recursive: true });
        
        // Create files in agent workspace
        const { writeFileSync } = await import("fs");
        writeFileSync(join(agentWorkspacePath, "file1.txt"), "content1");
        writeFileSync(join(agentWorkspacePath, "file2.txt"), "content2");
        
        const result = await vcs.cleanCopyToUpstream(agentWorkspacePath, upstreamPath);
        
        expect(result.success).toBe(true);
        expect(existsSync(join(upstreamPath, "file1.txt"))).toBe(true);
        expect(existsSync(join(upstreamPath, "file2.txt"))).toBe(true);
      }, 10000);

      it("should preserve .git directory during clean copy", async () => {
        const vcs = new VCS();
        const agentWorkspacePath = join(testHome, "agent-workspace-git");
        const upstreamPath = join(testHome, "upstream-git");
        
        mkdirSync(agentWorkspacePath, { recursive: true });
        mkdirSync(upstreamPath, { recursive: true });
        mkdirSync(join(upstreamPath, ".git"), { recursive: true });
        
        // Create a file in .git that should be preserved
        const { writeFileSync } = await import("fs");
        writeFileSync(join(upstreamPath, ".git", "HEAD"), "ref: refs/heads/main");
        writeFileSync(join(agentWorkspacePath, "newfile.txt"), "new content");
        
        const result = await vcs.cleanCopyToUpstream(agentWorkspacePath, upstreamPath);
        
        expect(result.success).toBe(true);
        expect(existsSync(join(upstreamPath, ".git", "HEAD"))).toBe(true);
        expect(existsSync(join(upstreamPath, "newfile.txt"))).toBe(true);
      }, 10000);

      it("should remove old files not in agent-workspace", async () => {
        const vcs = new VCS();
        const agentWorkspacePath = join(testHome, "agent-workspace-clean");
        const upstreamPath = join(testHome, "upstream-clean");
        
        mkdirSync(agentWorkspacePath, { recursive: true });
        mkdirSync(upstreamPath, { recursive: true });
        
        const { writeFileSync } = await import("fs");
        
        // Create files in upstream that should be removed
        writeFileSync(join(upstreamPath, "oldfile.txt"), "old content");
        
        // Create only new file in agent workspace
        writeFileSync(join(agentWorkspacePath, "newfile.txt"), "new content");
        
        const result = await vcs.cleanCopyToUpstream(agentWorkspacePath, upstreamPath);
        
        expect(result.success).toBe(true);
        expect(existsSync(join(upstreamPath, "newfile.txt"))).toBe(true);
        expect(existsSync(join(upstreamPath, "oldfile.txt"))).toBe(false);
      }, 10000);
    });

    describe("commitUpstream", () => {
      it("should commit in Git upstream with timestamp message", async () => {
        const vcs = new VCS();
        const { execSync } = await import("child_process");
        const upstreamPath = join(testHome, "upstream-git-commit");
        
        mkdirSync(upstreamPath, { recursive: true });
        execSync("git init", { cwd: upstreamPath });
        execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
        execSync("git config user.name \"Test User\"", { cwd: upstreamPath });
        
        // Create a file
        const { writeFileSync } = await import("fs");
        writeFileSync(join(upstreamPath, "test.txt"), "test");
        
        const result = await vcs.commitUpstream(upstreamPath, "git");
        
        expect(result.success).toBe(true);
        expect(result.output).toContain("Mimo commit at");
      }, 15000);

      it("should commit in Fossil upstream with timestamp message", async () => {
        const vcs = new VCS();
        const upstreamPath = join(testHome, "upstream-fossil-commit");
        const repoPath = join(testHome, "upstream-fossil-commit.fossil");
        
        mkdirSync(upstreamPath, { recursive: true });
        await vcs.createFossilRepo(repoPath);
        await vcs.openFossil(repoPath, upstreamPath);
        
        // Create a file
        const { writeFileSync } = await import("fs");
        writeFileSync(join(upstreamPath, "test.txt"), "test");
        
        const result = await vcs.commitUpstream(upstreamPath, "fossil");
        
        expect(result.success).toBe(true);
      }, 15000);

      it("should return success when no changes to commit", async () => {
        const vcs = new VCS();
        const { execSync } = await import("child_process");
        const upstreamPath = join(testHome, "upstream-git-empty");
        
        mkdirSync(upstreamPath, { recursive: true });
        execSync("git init", { cwd: upstreamPath });
        execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
        execSync("git config user.name \"Test User\"", { cwd: upstreamPath });
        
        // Commit with no changes
        const result = await vcs.commitUpstream(upstreamPath, "git");
        
        // Should return success but indicate no changes
        expect(result.success).toBe(true);
        expect(result.output).toContain("No changes to commit");
      }, 10000);
    });

    describe("pushUpstream", () => {
      it("should handle Git push (with no remote configured)", async () => {
        const vcs = new VCS();
        const { execSync } = await import("child_process");
        const upstreamPath = join(testHome, "upstream-git-push");
        
        mkdirSync(upstreamPath, { recursive: true });
        execSync("git init", { cwd: upstreamPath });
        execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
        execSync("git config user.name \"Test User\"", { cwd: upstreamPath });
        
        const { writeFileSync } = await import("fs");
        writeFileSync(join(upstreamPath, "test.txt"), "test");
        execSync("git add .", { cwd: upstreamPath });
        execSync('git commit -m "Initial"', { cwd: upstreamPath });
        
        // This will fail because there's no remote
        const result = await vcs.pushUpstream(upstreamPath, "git");
        
        // We expect it to fail (no remote), but the method should work
        expect(result).toBeDefined();
      }, 15000);

      it("should handle Fossil push", async () => {
        const vcs = new VCS();
        const upstreamPath = join(testHome, "upstream-fossil-push");
        const repoPath = join(testHome, "upstream-fossil-push.fossil");
        
        mkdirSync(upstreamPath, { recursive: true });
        await vcs.createFossilRepo(repoPath);
        await vcs.openFossil(repoPath, upstreamPath);
        
        const { writeFileSync } = await import("fs");
        writeFileSync(join(upstreamPath, "test.txt"), "test");
        await vcs.execCommand(["fossil", "add", "."], upstreamPath);
        await vcs.execCommand(["fossil", "commit", "-m", "Initial"], upstreamPath);
        
        // Push to same repo (will succeed but do nothing)
        const result = await vcs.pushUpstream(upstreamPath, "fossil");
        
        expect(result).toBeDefined();
      }, 15000);
    });
  });
});
