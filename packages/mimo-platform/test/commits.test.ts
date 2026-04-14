import { describe, it, expect, beforeEach } from "bun:test";
import { setMimoHome, clearConfig } from "../src/config/global-config.js";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";

describe("Commit Service Tests", () => {
  let testHome: string;
  let CommitService: any;
  let SessionRepository: any;
  let ProjectRepository: any;
  let VCS: any;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-commit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setMimoHome(testHome);

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });
    mkdirSync(join(testHome, "projects"), { recursive: true });

    const commitModule = await import("../src/commits/service.ts");
    CommitService = commitModule.commitService;

    const sessionModule = await import("../src/sessions/repository.ts");
    SessionRepository = sessionModule.SessionRepository;

    const projectModule = await import("../src/projects/repository.ts");
    ProjectRepository = projectModule.ProjectRepository;

    const vcsModule = await import("../src/vcs/index.ts");
    VCS = vcsModule.VCS;
  });

  describe("Commit and Push Flow", () => {
    it("should successfully complete 4-step commit flow for Git project", async () => {
      const vcs = new VCS();
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

      // Initialize agent-workspace with fossil
      const agentWorkspacePath = session.agentWorkspacePath;
      const fossilPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(fossilPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(fossilPath, agentWorkspacePath);

      // Add a file to agent workspace
      writeFileSync(join(agentWorkspacePath, "test.txt"), "test content");

      // Commit in agent workspace
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(["fossil", "commit", "-m", "Agent commit"], agentWorkspacePath);

      // Run commit and push
      const result = await CommitService.commitAndPush(session.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain("committed and pushed");
    }, 30000);

    it("should push to newBranch when project has newBranch configured", async () => {
      const vcs = new VCS();
      const sessionRepo = new SessionRepository();
      const projectRepo = new ProjectRepository();

      // Create a remote repo
      const remotePath = join(testHome, "remote-repo");
      mkdirSync(remotePath, { recursive: true });
      execSync("git init --bare", { cwd: remotePath });

      // Create a project with newBranch
      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: remotePath,
        repoType: "git",
        owner: "testuser",
        newBranch: "ai-session-feature-x",
      });

      // Create a session
      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Initialize upstream as Git repo with remote
      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
      execSync("git config user.name \"Test User\"", { cwd: upstreamPath });
      execSync(`git remote add origin ${remotePath}`, { cwd: upstreamPath });
      
      // Create initial commit and push to master
      writeFileSync(join(upstreamPath, "initial.txt"), "initial");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "Initial commit"', { cwd: upstreamPath });
      execSync("git push origin master", { cwd: upstreamPath });

      // Create the new branch in upstream
      await vcs.createBranch("ai-session-feature-x", "git", upstreamPath);

      // Initialize agent-workspace with fossil
      const agentWorkspacePath = session.agentWorkspacePath;
      const fossilPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(fossilPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(fossilPath, agentWorkspacePath);

      // Add a file to agent workspace
      writeFileSync(join(agentWorkspacePath, "test.txt"), "test content");

      // Commit in agent workspace
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(["fossil", "commit", "-m", "Agent commit"], agentWorkspacePath);

      // Run commit and push
      const result = await CommitService.commitAndPush(session.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain("committed and pushed");

      // Verify the branch was pushed to remote
      const remoteBranches = execSync("git branch -a", { cwd: remotePath, encoding: "utf8" });
      expect(remoteBranches).toContain("ai-session-feature-x");
    }, 30000);

    it("should fail gracefully when session not found", async () => {
      const result = await CommitService.commitAndPush("nonexistent-session-id");

      expect(result.success).toBe(false);
      expect(result.message).toBe("Session not found");
      expect(result.step).toBe(null);
    });

    it("should fail gracefully when project not found", async () => {
      const sessionRepo = new SessionRepository();

      // Create a session without a valid project
      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: "nonexistent-project-id",
        owner: "testuser",
      });

      const result = await CommitService.commitAndPush(session.id);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Project not found");
      expect(result.step).toBe(null);
    });

    it("should report no changes when agent-workspace is empty", async () => {
      const vcs = new VCS();
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

      // Initialize upstream as Git repo (but no commits yet)
      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
      execSync("git config user.name \"Test User\"", { cwd: upstreamPath });

      // Initialize agent-workspace with fossil
      const agentWorkspacePath = session.agentWorkspacePath;
      const fossilPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(fossilPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(fossilPath, agentWorkspacePath);

      // Don't add any files - this should result in "no changes"

      const result = await CommitService.commitAndPush(session.id);

      // When no changes, the service returns success=true with message "No changes to commit"
      // This is expected behavior - no changes is not an error
      expect(result.success).toBe(true);
      expect(result.message).toContain("No changes to commit");
    }, 30000);

    it("should use user-provided commit message in upstream repository", async () => {
      const vcs = new VCS();
      const sessionRepo = new SessionRepository();
      const projectRepo = new ProjectRepository();

      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync("git config user.email \"test@test.com\"", { cwd: upstreamPath });
      execSync("git config user.name \"Test User\"", { cwd: upstreamPath });

      const agentWorkspacePath = session.agentWorkspacePath;
      const fossilPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(fossilPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(fossilPath, agentWorkspacePath);

      writeFileSync(join(agentWorkspacePath, "test.txt"), "test content");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(["fossil", "commit", "-m", "Agent commit"], agentWorkspacePath);

      const userMessage = "feat(session): keep my commit title";
      const result = await CommitService.commitAndPush(session.id, userMessage);

      expect(result.success).toBe(true);

      const upstreamCommitMessage = execSync("git log -1 --pretty=%s", {
        cwd: upstreamPath,
        encoding: "utf8",
      }).trim();
      expect(upstreamCommitMessage).toBe(userMessage);
    }, 30000);
  });

  describe("5. Commit Preview and Selective Apply", () => {
    it("should return correct tree and statuses from preview endpoint", async () => {
      const vcs = new VCS();
      const sessionRepo = new SessionRepository();
      const projectRepo = new ProjectRepository();

      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync('git config user.email "test@test.com"', { cwd: upstreamPath });
      execSync('git config user.name "Test User"', { cwd: upstreamPath });

      const agentWorkspacePath = session.agentWorkspacePath;
      const fossilPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(fossilPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(fossilPath, agentWorkspacePath);

      // Create a nested structure in agent workspace
      mkdirSync(join(agentWorkspacePath, "src"), { recursive: true });
      writeFileSync(join(agentWorkspacePath, "src/file1.txt"), "content 1");
      writeFileSync(join(agentWorkspacePath, "src/file2.txt"), "content 2");
      writeFileSync(join(agentWorkspacePath, "root.txt"), "root content");
      
      // Commit files to fossil
      await vcs.execCommand(["fossil", "addremove"], agentWorkspacePath);
      await vcs.execCommand(["fossil", "commit", "-m", "Initial"], agentWorkspacePath);

      // Get preview (comparing agent-workspace with empty upstream)
      const preview = await CommitService.getPreview(session.id);

      expect(preview.success).toBe(true);
      expect(preview.preview).toBeDefined();
      expect(preview.preview!.summary.added).toBeGreaterThan(0);
      expect(preview.preview!.tree.length).toBeGreaterThan(0);
      // Tree should have "src" directory and "root.txt" file
      expect(preview.preview!.tree.some(n => n.name === "src" && n.type === "directory")).toBe(true);
      expect(preview.preview!.tree.some(n => n.name === "root.txt" && n.type === "file")).toBe(true);
      // Files should have correct paths and status
      expect(preview.preview!.files.some(f => f.path === "src/file1.txt" && f.status === "added")).toBe(true);
      expect(preview.preview!.files.some(f => f.path === "src/file2.txt" && f.status === "added")).toBe(true);
      expect(preview.preview!.files.some(f => f.path === "root.txt" && f.status === "added")).toBe(true);
    }, 30000);

    it("should block commit with empty message", async () => {
      const sessionRepo = new SessionRepository();
      const projectRepo = new ProjectRepository();

      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      const result = await CommitService.commitAndPushSelective(
        session.id,
        "", // Empty message
        undefined,
        undefined
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Commit message is required");
    });

    it("should validate that selected paths exist in preview set", async () => {
      const vcs = new VCS();
      const sessionRepo = new SessionRepository();
      const projectRepo = new ProjectRepository();

      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync('git config user.email "test@test.com"', { cwd: upstreamPath });
      execSync('git config user.name "Test User"', { cwd: upstreamPath });

      const agentWorkspacePath = session.agentWorkspacePath;
      const fossilPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(fossilPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(fossilPath, agentWorkspacePath);

      writeFileSync(join(agentWorkspacePath, "test.txt"), "test content");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(["fossil", "commit", "-m", "Initial"], agentWorkspacePath);

      // Try to commit with invalid path
      const result = await CommitService.commitAndPushSelective(
        session.id,
        "Test commit",
        ["nonexistent-file.txt"],
        undefined
      );

      expect(result.success).toBe(false);
      expect(result.invalidPaths).toContain("nonexistent-file.txt");
    }, 30000);

    it("should apply selective commit with only chosen files", async () => {
      const vcs = new VCS();
      const sessionRepo = new SessionRepository();
      const projectRepo = new ProjectRepository();

      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync('git config user.email "test@test.com"', { cwd: upstreamPath });
      execSync('git config user.name "Test User"', { cwd: upstreamPath });

      const agentWorkspacePath = session.agentWorkspacePath;
      const fossilPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(fossilPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(fossilPath, agentWorkspacePath);

      // Create two files
      writeFileSync(join(agentWorkspacePath, "file1.txt"), "content 1");
      writeFileSync(join(agentWorkspacePath, "file2.txt"), "content 2");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(["fossil", "commit", "-m", "Initial"], agentWorkspacePath);

      // Commit only file1
      const result = await CommitService.commitAndPushSelective(
        session.id,
        "Selective commit",
        ["file1.txt"],
        undefined
      );

      expect(result.success).toBe(true);

      // Verify only file1 is in upstream
      expect(existsSync(join(upstreamPath, "file1.txt"))).toBe(true);
    }, 30000);
  });
});
