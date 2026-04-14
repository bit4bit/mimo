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

    // cleanCopyToUpstream has been replaced by patch-based sync
    // See test/patch-sync.test.ts for generateAndApplyPatch tests

    describe("commitUpstream", () => {
      it("should use explicit commit message when provided for Git upstream", async () => {
        const vcs = new VCS();
        const { execSync } = await import("child_process");
        const upstreamPath = join(testHome, "upstream-git-custom-message");

        mkdirSync(upstreamPath, { recursive: true });
        execSync("git init", { cwd: upstreamPath });
        execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
        execSync("git config user.name \"Test User\"", { cwd: upstreamPath });

        const { writeFileSync } = await import("fs");
        writeFileSync(join(upstreamPath, "test.txt"), "test");

        const customMessage = "fix(commit): preserve UI message";
        const result = await (vcs as any).commitUpstream(upstreamPath, "git", customMessage);

        expect(result.success).toBe(true);

        const commitSubject = execSync("git log -1 --pretty=%s", {
          cwd: upstreamPath,
          encoding: "utf8",
        }).trim();
        expect(commitSubject).toBe(customMessage);
      }, 15000);

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

  describe("Branch Operations", () => {
    describe("createBranch", () => {
      it("should create a new branch in Git repository", async () => {
        const vcs = new VCS();
        const { execSync } = await import("child_process");
        const upstreamPath = join(testHome, "git-branch-test");
        
        mkdirSync(upstreamPath, { recursive: true });
        execSync("git init", { cwd: upstreamPath });
        execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
        execSync("git config user.name \"Test User\"", { cwd: upstreamPath });
        
        const { writeFileSync } = await import("fs");
        writeFileSync(join(upstreamPath, "test.txt"), "test");
        execSync("git add .", { cwd: upstreamPath });
        execSync('git commit -m "Initial"', { cwd: upstreamPath });
        
        const result = await vcs.createBranch("feature-branch", "git", upstreamPath);
        
        expect(result.success).toBe(true);
        
        // Verify branch was created
        const branchOutput = execSync("git branch", { cwd: upstreamPath, encoding: "utf8" });
        expect(branchOutput).toContain("feature-branch");
        
        // Verify we're on the new branch
        const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: upstreamPath, encoding: "utf8" });
        expect(currentBranch.trim()).toBe("feature-branch");
      }, 15000);

      it("should overwrite existing Git branch with -B flag", async () => {
        const vcs = new VCS();
        const { execSync } = await import("child_process");
        const upstreamPath = join(testHome, "git-branch-overwrite-test");
        
        mkdirSync(upstreamPath, { recursive: true });
        execSync("git init", { cwd: upstreamPath });
        execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
        execSync("git config user.name \"Test User\"", { cwd: upstreamPath });
        
        const { writeFileSync } = await import("fs");
        writeFileSync(join(upstreamPath, "test.txt"), "test");
        execSync("git add .", { cwd: upstreamPath });
        execSync('git commit -m "Initial"', { cwd: upstreamPath });
        
        // Create initial branch
        await vcs.createBranch("existing-branch", "git", upstreamPath);
        
        // Make a commit on master
        execSync("git checkout master", { cwd: upstreamPath });
        writeFileSync(join(upstreamPath, "another.txt"), "another");
        execSync("git add .", { cwd: upstreamPath });
        execSync('git commit -m "Another commit"', { cwd: upstreamPath });
        
        // Try to create branch that already exists - should overwrite
        const result = await vcs.createBranch("existing-branch", "git", upstreamPath);
        
        expect(result.success).toBe(true);
        
        // Verify we're on the new branch
        const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: upstreamPath, encoding: "utf8" });
        expect(currentBranch.trim()).toBe("existing-branch");
      }, 15000);

      it("should create a new branch in Fossil repository", async () => {
        const vcs = new VCS();
        const repoPath = join(testHome, "fossil-branch-test.fossil");
        const workDir = join(testHome, "fossil-branch-work");
        
        await vcs.createFossilRepo(repoPath);
        mkdirSync(workDir, { recursive: true });
        await vcs.openFossil(repoPath, workDir);
        
        const { writeFileSync } = await import("fs");
        writeFileSync(join(workDir, "test.txt"), "test");
        await vcs.execCommand(["fossil", "add", "test.txt"], workDir);
        await vcs.execCommand(["fossil", "commit", "-m", "Initial"], workDir);
        
        const result = await vcs.createBranch("feature-branch", "fossil", workDir);
        
        expect(result.success).toBe(true);
      }, 15000);
    });

    describe("cloneRepository with sourceBranch", () => {
      it("should clone Git repository without sourceBranch (existing behavior)", async () => {
        const vcs = new VCS();
        const { execSync } = await import("child_process");
        const sourcePath = join(testHome, "source-repo");
        
        // Create a source repo
        mkdirSync(sourcePath, { recursive: true });
        execSync("git init", { cwd: sourcePath });
        execSync("git config user.email \"test@test.com\"", { cwd: sourcePath });
        execSync("git config user.name \"Test User\"", { cwd: sourcePath });
        
        const { writeFileSync } = await import("fs");
        writeFileSync(join(sourcePath, "README.md"), "# Source Repo");
        execSync("git add .", { cwd: sourcePath });
        execSync('git commit -m "Initial commit"', { cwd: sourcePath });
        
      execSync("git checkout -b feature/v2", { cwd: sourcePath });
      writeFileSync(join(sourcePath, "feature.txt"), "feature content");
      execSync("git add .", { cwd: sourcePath });
      execSync('git commit -m "Feature commit"', { cwd: sourcePath });
      
      // Switch back to master
      execSync("git checkout master", { cwd: sourcePath });
        
        // Clone without sourceBranch - should clone default branch (main)
        const targetPath = join(testHome, "cloned-repo-default");
        const result = await vcs.cloneRepository(sourcePath, "git", targetPath);
        
        expect(result.success).toBe(true);
        expect(existsSync(join(targetPath, "README.md"))).toBe(true);
        expect(existsSync(join(targetPath, "feature.txt"))).toBe(false);
      }, 15000);

      it("should clone Git repository with sourceBranch", async () => {
        const vcs = new VCS();
        const { execSync } = await import("child_process");
        const sourcePath = join(testHome, "source-repo-branch");
        
        // Create a source repo
        mkdirSync(sourcePath, { recursive: true });
        execSync("git init", { cwd: sourcePath });
        execSync("git config user.email \"test@test.com\"", { cwd: sourcePath });
        execSync("git config user.name \"Test User\"", { cwd: sourcePath });
        
        const { writeFileSync } = await import("fs");
        writeFileSync(join(sourcePath, "main.txt"), "main content");
        execSync("git add .", { cwd: sourcePath });
        execSync('git commit -m "Main commit"', { cwd: sourcePath });
        
      execSync("git checkout -b feature/v2", { cwd: sourcePath });
      writeFileSync(join(sourcePath, "feature.txt"), "feature content");
      execSync("git add .", { cwd: sourcePath });
      execSync('git commit -m "Feature commit"', { cwd: sourcePath });
      
      // Switch back to master
      execSync("git checkout master", { cwd: sourcePath });
        
        // Clone with sourceBranch - should clone the feature/v2 branch
        const targetPath = join(testHome, "cloned-repo-branch");
        const result = await vcs.cloneRepository(sourcePath, "git", targetPath, undefined, "feature/v2");
        
        expect(result.success).toBe(true);
        expect(existsSync(join(targetPath, "feature.txt"))).toBe(true);
        
        // Verify we're on the feature branch
        const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: targetPath, encoding: "utf8" });
        expect(currentBranch.trim()).toBe("feature/v2");
      }, 15000);
    });
  });

  describe("syncIgnoresToFossil", () => {
    it("should combine .gitignore and .mimoignore patterns into ignore-glob", async () => {
      const vcs = new VCS();
      const { writeFileSync, readFileSync } = await import("fs");

      const upstreamPath = join(testHome, "upstream-combined");
      const agentWorkspacePath = join(testHome, "agent-combined");
      const repoPath = join(testHome, "combined-sync.fossil");

      mkdirSync(upstreamPath, { recursive: true });
      mkdirSync(agentWorkspacePath, { recursive: true });

      writeFileSync(join(upstreamPath, ".gitignore"), [
        "# comment",
        "node_modules/",
        "",
        "dist/",
        "*.log",
      ].join("\n"));

      writeFileSync(join(upstreamPath, ".mimoignore"), [
        "# mimo-specific",
        ".mimo-cache/",
        "*.tmp",
      ].join("\n"));

      await vcs.createFossilRepo(repoPath);
      await vcs.openFossil(repoPath, agentWorkspacePath);

      const result = await vcs.syncIgnoresToFossil(upstreamPath, agentWorkspacePath);

      expect(result.success).toBe(true);

      const ignoreGlob = readFileSync(
        join(agentWorkspacePath, ".fossil-settings", "ignore-glob"),
        "utf8"
      );
      // .gitignore patterns present
      expect(ignoreGlob).toContain("node_modules/");
      expect(ignoreGlob).toContain("dist/");
      expect(ignoreGlob).toContain("*.log");
      // .mimoignore patterns present
      expect(ignoreGlob).toContain(".mimo-cache/");
      expect(ignoreGlob).toContain("*.tmp");
      // comments stripped
      expect(ignoreGlob).not.toContain("# comment");
      expect(ignoreGlob).not.toContain("# mimo-specific");
    }, 15000);

    it("should include patterns from .mimoignore even when .gitignore is absent", async () => {
      const vcs = new VCS();
      const { writeFileSync, readFileSync } = await import("fs");

      const upstreamPath = join(testHome, "upstream-mimoonly");
      const agentWorkspacePath = join(testHome, "agent-mimoonly");
      const repoPath = join(testHome, "mimoonly.fossil");

      mkdirSync(upstreamPath, { recursive: true });
      mkdirSync(agentWorkspacePath, { recursive: true });

      writeFileSync(join(upstreamPath, ".mimoignore"), ".mimo-cache/\n*.tmp\n");

      await vcs.createFossilRepo(repoPath);
      await vcs.openFossil(repoPath, agentWorkspacePath);

      const result = await vcs.syncIgnoresToFossil(upstreamPath, agentWorkspacePath);

      expect(result.success).toBe(true);

      const ignoreGlob = readFileSync(
        join(agentWorkspacePath, ".fossil-settings", "ignore-glob"),
        "utf8"
      );
      expect(ignoreGlob).toContain(".mimo-cache/");
      expect(ignoreGlob).toContain("*.tmp");
    }, 15000);

    it("should return success and skip when neither .gitignore nor .mimoignore exist", async () => {
      const vcs = new VCS();
      const upstreamPath = join(testHome, "upstream-no-ignores");
      const agentWorkspacePath = join(testHome, "agent-no-ignores");
      const repoPath = join(testHome, "no-ignores.fossil");

      mkdirSync(upstreamPath, { recursive: true });
      mkdirSync(agentWorkspacePath, { recursive: true });

      await vcs.createFossilRepo(repoPath);
      await vcs.openFossil(repoPath, agentWorkspacePath);

      const result = await vcs.syncIgnoresToFossil(upstreamPath, agentWorkspacePath);

      expect(result.success).toBe(true);
      expect(result.output).toContain("skipping");
      expect(existsSync(join(agentWorkspacePath, ".fossil-settings", "ignore-glob"))).toBe(false);
    }, 15000);

    it("should return success and skip when both ignore files have only comments and blank lines", async () => {
      const vcs = new VCS();
      const { writeFileSync } = await import("fs");

      const upstreamPath = join(testHome, "upstream-empty-ignores");
      const agentWorkspacePath = join(testHome, "agent-empty-ignores");
      const repoPath = join(testHome, "empty-ignores.fossil");

      mkdirSync(upstreamPath, { recursive: true });
      mkdirSync(agentWorkspacePath, { recursive: true });

      writeFileSync(join(upstreamPath, ".gitignore"), "# just a comment\n\n");
      writeFileSync(join(upstreamPath, ".mimoignore"), "# mimo comment\n\n");

      await vcs.createFossilRepo(repoPath);
      await vcs.openFossil(repoPath, agentWorkspacePath);

      const result = await vcs.syncIgnoresToFossil(upstreamPath, agentWorkspacePath);

      expect(result.success).toBe(true);
      expect(result.output).toContain("skipping");
    }, 15000);

    it("should commit the ignore-glob so it appears in fossil history", async () => {
      const vcs = new VCS();
      const { writeFileSync } = await import("fs");
      const { execSync } = await import("child_process");

      const upstreamPath = join(testHome, "upstream-commit-check");
      const agentWorkspacePath = join(testHome, "agent-commit-check");
      const repoPath = join(testHome, "commit-check.fossil");

      mkdirSync(upstreamPath, { recursive: true });
      mkdirSync(agentWorkspacePath, { recursive: true });

      writeFileSync(join(upstreamPath, ".gitignore"), "node_modules/\ndist/\n");
      writeFileSync(join(upstreamPath, ".mimoignore"), ".mimo-cache/\n");

      await vcs.createFossilRepo(repoPath);
      await vcs.openFossil(repoPath, agentWorkspacePath);

      await vcs.syncIgnoresToFossil(upstreamPath, agentWorkspacePath);

      const log = execSync("fossil timeline --limit 5", {
        cwd: agentWorkspacePath,
        encoding: "utf8",
      });
      expect(log).toContain("Setup ignore-glob from .gitignore and .mimoignore");
    }, 15000);
  });
});
});
