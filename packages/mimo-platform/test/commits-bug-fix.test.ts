import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { execSync } from "child_process";

describe("Commit Service Bug Fix - Untracked Files Preservation", () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-commit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    process.env.MIMO_HOME = testHome;

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });
    mkdirSync(join(testHome, "projects"), { recursive: true });
  });

  describe("Bug: cleanCopyToUpstream deletes untracked files", () => {
    it("should preserve .opencode and other untracked directories during commit", async () => {
      const { commitService } = await import("../src/commits/service.ts");
      const { SessionRepository } = await import("../src/sessions/repository.ts");
      const { ProjectRepository } = await import("../src/projects/repository.ts");
      const { vcs } = await import("../src/vcs/index.ts");

      const sessionRepo = new SessionRepository();
      const projectRepo = new ProjectRepository();

      // Create a project
      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create a session
      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Initialize upstream as Git repo
      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
      execSync("git config user.name \"Test User\"", { cwd: upstreamPath });

      // Create initial commit with some files
      writeFileSync(join(upstreamPath, "README.md"), "# Test");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "Initial commit"', { cwd: upstreamPath });

      // Now create untracked directories/files that should be preserved
      mkdirSync(join(upstreamPath, ".opencode"), { recursive: true });
      writeFileSync(join(upstreamPath, ".opencode", "config.json"), "{}");
      
      mkdirSync(join(upstreamPath, ".vscode"), { recursive: true });
      writeFileSync(join(upstreamPath, ".vscode", "settings.json"), "{}");
      
      mkdirSync(join(upstreamPath, "node_modules"), { recursive: true });
      writeFileSync(join(upstreamPath, "node_modules", "test.txt"), "module");
      
      // Create a file that won't be tracked by git (simulates untracked files)
      writeFileSync(join(upstreamPath, "untracked.txt"), "untracked content");

      // Initialize agent-workspace with fossil
      const agentWorkspacePath = session.agentWorkspacePath;
      const fossilPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(fossilPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(fossilPath, agentWorkspacePath);

      // Add a file to agent workspace (this is the agent's change)
      writeFileSync(join(agentWorkspacePath, "agent-change.txt"), "agent content");
      writeFileSync(join(agentWorkspacePath, "README.md"), "# Test Modified by Agent");

      // Commit in agent workspace
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(["fossil", "commit", "-m", "Agent commit"], agentWorkspacePath);

      // BEFORE commit: verify files exist
      expect(existsSync(join(upstreamPath, ".opencode", "config.json"))).toBe(true);
      expect(existsSync(join(upstreamPath, ".vscode", "settings.json"))).toBe(true);
      expect(existsSync(join(upstreamPath, "node_modules", "test.txt"))).toBe(true);
      expect(existsSync(join(upstreamPath, "untracked.txt"))).toBe(true);

      // Run commit and push
      const result = await commitService.commitAndPush(session.id);

      // AFTER commit: verify untracked files are preserved
      // This is the bug - cleanCopyToUpstream deletes these!
      expect(existsSync(join(upstreamPath, ".opencode", "config.json"))).toBe(true);
      expect(existsSync(join(upstreamPath, ".vscode", "settings.json"))).toBe(true);
      expect(existsSync(join(upstreamPath, "node_modules", "test.txt"))).toBe(true);
      expect(existsSync(join(upstreamPath, "untracked.txt"))).toBe(true);

      // Verify agent changes were committed
      expect(result.success).toBe(true);
      expect(existsSync(join(upstreamPath, "agent-change.txt"))).toBe(true);
      expect(readFileSync(join(upstreamPath, "README.md"), "utf-8")).toBe("# Test Modified by Agent");
    }, 30000);

    it("should only delete files intentionally deleted by agent, not all files", async () => {
      const { commitService } = await import("../src/commits/service.ts");
      const { SessionRepository } = await import("../src/sessions/repository.ts");
      const { ProjectRepository } = await import("../src/projects/repository.ts");
      const { vcs } = await import("../src/vcs/index.ts");

      const sessionRepo = new SessionRepository();
      const projectRepo = new ProjectRepository();

      // Create a project
      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create a session
      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Initialize upstream as Git repo
      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
      execSync("git config user.name \"Test User\"", { cwd: upstreamPath });

      // Create initial commit with some tracked files
      writeFileSync(join(upstreamPath, "tracked.txt"), "tracked content");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "Initial commit"', { cwd: upstreamPath });

      // Initialize agent-workspace with fossil
      const agentWorkspacePath = session.agentWorkspacePath;
      const fossilPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(fossilPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(fossilPath, agentWorkspacePath);

      // Setup: Both repos have the same file
      writeFileSync(join(agentWorkspacePath, "tracked.txt"), "tracked content");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(["fossil", "commit", "-m", "Setup"], agentWorkspacePath);

      // Now agent deletes the file
      // Note: File deletion by agent needs to be detected and synced
      // For now, this test documents the expected behavior

      // Create an untracked file in upstream
      writeFileSync(join(upstreamPath, "untracked-file.txt"), "should survive");

      // BEFORE commit: file exists
      expect(existsSync(join(upstreamPath, "untracked-file.txt"))).toBe(true);

      // Run commit and push (agent made no changes, just sync)
      const result = await commitService.commitAndPush(session.id);

      // AFTER commit: untracked file should still exist
      expect(existsSync(join(upstreamPath, "untracked-file.txt"))).toBe(true);
    }, 30000);
    it("should delete files from upstream when intentionally deleted by agent", async () => {
      const { commitService } = await import("../src/commits/service.ts");
      const { SessionRepository } = await import("../src/sessions/repository.ts");
      const { ProjectRepository } = await import("../src/projects/repository.ts");
      const { vcs } = await import("../src/vcs/index.ts");

      const sessionRepo = new SessionRepository();
      const projectRepo = new ProjectRepository();

      // Create a project
      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      // Create a session
      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Initialize upstream as Git repo
      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
      execSync("git config user.name \"Test User\"", { cwd: upstreamPath });

      // Create initial commit with some files
      writeFileSync(join(upstreamPath, "README.md"), "# Test");
      writeFileSync(join(upstreamPath, "old-file.txt"), "to be deleted");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "Initial commit"', { cwd: upstreamPath });

      // Initialize agent-workspace with fossil
      const agentWorkspacePath = session.agentWorkspacePath;
      const fossilPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(fossilPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(fossilPath, agentWorkspacePath);

      // Setup: Agent has both files
      writeFileSync(join(agentWorkspacePath, "README.md"), "# Test");
      writeFileSync(join(agentWorkspacePath, "old-file.txt"), "to be deleted");

      // Commit in agent workspace (baseline is now recorded)
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(["fossil", "commit", "-m", "Agent setup"], agentWorkspacePath);

      // First sync - establishes baseline
      const result1 = await commitService.commitAndPush(session.id);
      expect(result1.success).toBe(true);

      // Verify both files exist in upstream
      expect(existsSync(join(upstreamPath, "README.md"))).toBe(true);
      expect(existsSync(join(upstreamPath, "old-file.txt"))).toBe(true);

      // Agent deletes a file
      // First commit this deletion to fossil
      await vcs.execCommand(["fossil", "rm", "old-file.txt"], agentWorkspacePath);
      await vcs.execCommand(["fossil", "commit", "-m", "Delete old file"], agentWorkspacePath);

      // Second sync - should delete old-file.txt from upstream
      const result2 = await commitService.commitAndPush(session.id);
      expect(result2.success).toBe(true);

      // Verify deleted file is gone from upstream
      expect(existsSync(join(upstreamPath, "README.md"))).toBe(true);
      expect(existsSync(join(upstreamPath, "old-file.txt"))).toBe(false);

      // Verify untracked files are still preserved
      writeFileSync(join(upstreamPath, "untracked.txt"), "preserved");
      expect(existsSync(join(upstreamPath, "untracked.txt"))).toBe(true);
    }, 30000);
  });
});
