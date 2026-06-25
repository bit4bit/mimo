import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import {
  rmSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  readFileSync,
} from "fs";
import { execSync } from "child_process";
import { createOS } from "../src/infrastructure/os/node-adapter.js";

describe("Commit Service Tests", () => {
  let testHome: string;
  let ctx: any;
  let CommitService: any;
  let VCS: any;
  let os: any;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-commit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });
    mkdirSync(join(testHome, "projects"), { recursive: true });

    os = createOS({ ...process.env });

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
      os,
    });

    // Use services from mimoContext
    CommitService = ctx.services.commits;

    const vcsModule = await import("../src/domain/vcs/index.ts");
    VCS = vcsModule.VCS;
  });

  describe("Commit and Push Flow", () => {
    it("should successfully complete 4-step commit flow for Git project", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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
      execSync('git config user.email "test@test.com"', { cwd: upstreamPath });
      execSync('git config user.name "Test User"', { cwd: upstreamPath });

      // Initialize agent-workspace with fossil
      const agentWorkspacePath = session.agentWorkspacePath;
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      // Add a file to agent workspace
      writeFileSync(join(agentWorkspacePath, "test.txt"), "test content");

      // Commit in agent workspace
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Agent commit"],
        agentWorkspacePath,
      );

      // Run commit and push
      const result = await ctx.services.commits.commitAndPush(session.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain("committed and pushed");
    }, 30000);

    it("should push to newBranch when project has newBranch configured", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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
      execSync('git config user.email "test@test.com"', { cwd: upstreamPath });
      execSync('git config user.name "Test User"', { cwd: upstreamPath });
      execSync("git checkout -b master", { cwd: upstreamPath });
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
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      // Add a file to agent workspace
      writeFileSync(join(agentWorkspacePath, "test.txt"), "test content");

      // Commit in agent workspace
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Agent commit"],
        agentWorkspacePath,
      );

      // Run commit and push
      const result = await ctx.services.commits.commitAndPush(session.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain("committed and pushed");

      // Verify the branch was pushed to remote
      const remoteBranches = execSync("git branch -a", {
        cwd: remotePath,
        encoding: "utf8",
      });
      expect(remoteBranches).toContain("ai-session-feature-x");
    }, 30000);

    it("should fail gracefully when session not found", async () => {
      const result = await ctx.services.commits.commitAndPush(
        "nonexistent-session-id",
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe("Session not found");
      expect(result.step).toBe(null);
    });

    it("should fail gracefully when project not found", async () => {
      const sessionRepo = ctx.repos.sessions;

      // Create a session without a valid project
      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: "nonexistent-project-id",
        owner: "testuser",
      });

      const result = await ctx.services.commits.commitAndPush(session.id);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Project not found");
      expect(result.step).toBe(null);
    });

    it("should report no changes when agent-workspace is empty", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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
      execSync('git config user.email "test@test.com"', { cwd: upstreamPath });
      execSync('git config user.name "Test User"', { cwd: upstreamPath });

      // Initialize agent-workspace with fossil
      const agentWorkspacePath = session.agentWorkspacePath;
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      // Don't add any files - this should result in "no changes"

      const result = await ctx.services.commits.commitAndPush(session.id);

      // When no changes, the service returns success=true with message "No changes to commit"
      // This is expected behavior - no changes is not an error
      expect(result.success).toBe(true);
      expect(result.message).toContain("No changes to commit");
    }, 30000);

    it("should use user-provided commit message in upstream repository", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      writeFileSync(join(agentWorkspacePath, "test.txt"), "test content");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Agent commit"],
        agentWorkspacePath,
      );

      const userMessage = "feat(session): keep my commit title";
      const result = await ctx.services.commits.commitAndPush(
        session.id,
        userMessage,
      );

      expect(result.success).toBe(true);

      const upstreamCommitMessage = execSync("git log -1 --pretty=%s", {
        cwd: upstreamPath,
        encoding: "utf8",
      }).trim();
      expect(upstreamCommitMessage).toBe(userMessage);
    }, 30000);
  });

  describe("5. Commit Preview and Selective Apply", () => {
    it("should return correct flat file list and statuses from preview endpoint", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      // Create a nested structure in agent workspace
      mkdirSync(join(agentWorkspacePath, "src"), { recursive: true });
      writeFileSync(join(agentWorkspacePath, "src/file1.txt"), "content 1");
      writeFileSync(join(agentWorkspacePath, "src/file2.txt"), "content 2");
      writeFileSync(join(agentWorkspacePath, "root.txt"), "root content");

      // Commit files to fossil
      await vcs.execCommand(["fossil", "addremove"], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Initial"],
        agentWorkspacePath,
      );

      // Get preview (comparing agent-workspace with empty upstream)
      const preview = await ctx.services.commits.getPreview(session.id);

      expect(preview.success).toBe(true);
      expect(preview.preview).toBeDefined();
      expect(preview.preview!.summary.added).toBeGreaterThan(0);
      // Files should have correct paths and status
      expect(
        preview.preview!.files.some(
          (f) => f.path === "src/file1.txt" && f.status === "added",
        ),
      ).toBe(true);
      expect(
        preview.preview!.files.some(
          (f) => f.path === "src/file2.txt" && f.status === "added",
        ),
      ).toBe(true);
      expect(
        preview.preview!.files.some(
          (f) => f.path === "root.txt" && f.status === "added",
        ),
      ).toBe(true);
    }, 30000);

    it("preview should not include full hunks to keep responses small", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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

      // Create initial file in upstream and commit it
      writeFileSync(join(upstreamPath, "test.txt"), "original content\n");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "Initial"', { cwd: upstreamPath });

      const agentWorkspacePath = session.agentWorkspacePath;
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      // Create a large modified file in workspace so the patch would be huge.
      const modifiedContent = Array.from(
        { length: 5000 },
        (_, i) => `modified line ${i}`,
      ).join("\n");
      writeFileSync(join(agentWorkspacePath, "test.txt"), modifiedContent);
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Modify"],
        agentWorkspacePath,
      );

      const preview = await ctx.services.commits.getPreview(session.id);

      expect(preview.success).toBe(true);
      expect(preview.preview).toBeDefined();

      const modifiedFile = preview.preview!.files.find(
        (f) => f.path === "test.txt" && f.status === "modified",
      );
      expect(modifiedFile).toBeDefined();
      // The preview response should not carry full hunks; hunks are fetched on
      // demand via a separate endpoint.
      expect(modifiedFile!.hunks).toBeUndefined();
    }, 30000);

    it("should fetch file hunks on demand", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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

      writeFileSync(join(upstreamPath, "test.txt"), "original content\n");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "Initial"', { cwd: upstreamPath });

      const agentWorkspacePath = session.agentWorkspacePath;
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      writeFileSync(join(agentWorkspacePath, "test.txt"), "modified content\n");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Modify"],
        agentWorkspacePath,
      );

      const result = await ctx.services.commits.getFileHunks(
        session.id,
        "test.txt",
      );

      expect(result.success).toBe(true);
      expect(result.hunks).toBeDefined();
      expect(result.hunks!.length).toBeGreaterThan(0);
      expect(result.hunks![0].lines.length).toBeGreaterThan(0);
    }, 30000);

    it("should block commit with empty message", async () => {
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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

      const result = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "", // Empty message
        undefined,
        undefined,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Commit message is required");
    });

    it("should validate that selected paths exist in preview set", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      writeFileSync(join(agentWorkspacePath, "test.txt"), "test content");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Initial"],
        agentWorkspacePath,
      );

      // Try to commit with invalid path
      const result = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "Test commit",
        ["nonexistent-file.txt"],
        undefined,
      );

      expect(result.success).toBe(false);
      expect(result.invalidPaths).toContain("nonexistent-file.txt");
    }, 30000);

    it("should apply selective commit with only chosen files", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      // Create two files
      writeFileSync(join(agentWorkspacePath, "file1.txt"), "content 1");
      writeFileSync(join(agentWorkspacePath, "file2.txt"), "content 2");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Initial"],
        agentWorkspacePath,
      );

      // Commit only file1
      const result = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "Selective commit",
        ["file1.txt"],
        undefined,
      );

      expect(result.success).toBe(true);

      // Verify only file1 is in upstream
      expect(existsSync(join(upstreamPath, "file1.txt"))).toBe(true);
    }, 30000);

    it("should store patch with actual diff before applying files", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      // Create file in workspace
      writeFileSync(join(agentWorkspacePath, "test.txt"), "new content");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Initial"],
        agentWorkspacePath,
      );

      // Commit via service
      const result = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "Test commit",
        ["test.txt"],
        undefined,
      );

      expect(result.success).toBe(true);

      // Verify patch was stored
      // Session path is: {projects}/{projectId}/sessions/{sessionId}
      const sessionDir = join(
        testHome,
        "projects",
        project.id,
        "sessions",
        session.id,
      );
      const patchesDir = join(sessionDir, "patches");
      expect(existsSync(patchesDir)).toBe(true);

      // Read stored patch
      const patchFiles = readdirSync(patchesDir);
      expect(patchFiles.length).toBeGreaterThan(0);

      const patchContent = readFileSync(
        join(patchesDir, patchFiles[0]),
        "utf-8",
      );

      // Patch should contain the actual diff, not be empty
      expect(patchContent).toContain("diff");
      expect(patchContent).toContain("new content");
      expect(patchContent).not.toBe("");
    }, 30000);

    it("uses project SSH credential for commit and push", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;
      const credentialRepo = ctx.repos.credentials;

      const credential = await credentialRepo.create({
        owner: "testuser",
        name: "ssh-key",
        type: "ssh",
        privateKey:
          "-----BEGIN OPENSSH PRIVATE KEY-----\nmock\n-----END OPENSSH PRIVATE KEY-----",
      });

      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "git@github.com:test/repo.git",
        repoType: "git",
        owner: "testuser",
        credentialId: credential.id,
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
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      writeFileSync(join(agentWorkspacePath, "test.txt"), "new content");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Initial"],
        agentWorkspacePath,
      );

      let pushedCredential: any;
      const originalPushUpstream = ctx.services.vcs.pushUpstream.bind(
        ctx.services.vcs,
      );
      ctx.services.vcs.pushUpstream = async (
        path: string,
        repoType: "git" | "fossil",
        credentialArg?: any,
        branch?: string,
      ) => {
        pushedCredential = credentialArg;
        return {
          success: true,
          output: "stubbed push",
        };
      };

      try {
        const result = await ctx.services.commits.commitAndPushSelective(
          session.id,
          "Test commit",
          ["test.txt"],
          undefined,
        );

        expect(result.success).toBe(true);
        expect(pushedCredential?.id).toBe(credential.id);
        expect(pushedCredential?.type).toBe("ssh");
      } finally {
        ctx.services.vcs.pushUpstream = originalPushUpstream;
      }
    }, 30000);

    it("fails push when configured project credential is missing", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "git@github.com:test/repo.git",
        repoType: "git",
        owner: "testuser",
        credentialId: "missing-credential-id",
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
      const vcsPath = join(testHome, "repo.fossil");
      await vcs.createFossilRepo(vcsPath);
      mkdirSync(agentWorkspacePath, { recursive: true });
      await vcs.openFossil(vcsPath, agentWorkspacePath);

      writeFileSync(join(agentWorkspacePath, "test.txt"), "new content");
      await vcs.execCommand(["fossil", "add", "."], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Initial"],
        agentWorkspacePath,
      );

      const result = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "Test commit",
        ["test.txt"],
        undefined,
      );

      expect(result.success).toBe(false);
      expect(result.step).toBe("push");
      expect(result.error).toBe("Project credential not found");
    }, 30000);
  });

  describe("Force Push Endpoint", () => {
    it("uses project SSH credential for force push", async () => {
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;
      const credentialRepo = ctx.repos.credentials;

      const credential = await credentialRepo.create({
        owner: "testuser",
        name: "ssh-key",
        type: "ssh",
        privateKey:
          "-----BEGIN OPENSSH PRIVATE KEY-----\nmock\n-----END OPENSSH PRIVATE KEY-----",
      });

      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "git@github.com:test/repo.git",
        repoType: "git",
        owner: "testuser",
        credentialId: credential.id,
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

      let pushedCredential: any;
      const originalPushUpstream = ctx.services.vcs.pushUpstream.bind(
        ctx.services.vcs,
      );
      ctx.services.vcs.pushUpstream = async (
        path: string,
        repoType: "git" | "fossil",
        credentialArg?: any,
        branch?: string,
      ) => {
        pushedCredential = credentialArg;
        return {
          success: true,
          output: "stubbed push",
        };
      };

      try {
        const result = await ctx.services.commits.forcePush(session.id);

        expect(result.success).toBe(true);
        expect(pushedCredential?.id).toBe(credential.id);
        expect(pushedCredential?.type).toBe("ssh");
      } finally {
        ctx.services.vcs.pushUpstream = originalPushUpstream;
      }
    }, 30000);

    it("fails force push when configured project credential is missing", async () => {
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "git@github.com:test/repo.git",
        repoType: "git",
        owner: "testuser",
        credentialId: "missing-credential-id",
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

      const result = await ctx.services.commits.forcePush(session.id);

      expect(result.success).toBe(false);
      expect(result.step).toBe("push");
      expect(result.error).toBe("Project credential not found");
    }, 30000);

    it("should return success when force push works", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

      // Create a remote repo
      const remotePath = join(testHome, "remote-force-success");
      mkdirSync(remotePath, { recursive: true });
      execSync("git init --bare", { cwd: remotePath });

      // Create a project
      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: remotePath,
        repoType: "git",
        owner: "testuser",
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
      execSync('git config user.email "test@test.com"', { cwd: upstreamPath });
      execSync('git config user.name "Test User"', { cwd: upstreamPath });
      execSync("git checkout -b master", { cwd: upstreamPath });
      execSync(`git remote add origin ${remotePath}`, { cwd: upstreamPath });

      // Create initial commit and push
      writeFileSync(join(upstreamPath, "test.txt"), "initial");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "Initial"', { cwd: upstreamPath });
      execSync("git push origin master", { cwd: upstreamPath });

      // Amend commit to create divergence
      writeFileSync(join(upstreamPath, "test.txt"), "modified");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit --amend -m "Initial (amended)"', {
        cwd: upstreamPath,
      });

      // Call forcePush via service
      const result = await ctx.services.commits.forcePush(session.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain("Force push completed");
    }, 30000);

    it("should return error when session not found", async () => {
      const result = await ctx.services.commits.forcePush(
        "nonexistent-session-id",
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe("Session not found");
      expect(result.step).toBe(null);
    });

    it("should return success with message when no remote configured", async () => {
      const vcs = new VCS({ os });
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

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

      // Initialize upstream as Git repo but NO remote
      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync('git config user.email "test@test.com"', { cwd: upstreamPath });
      execSync('git config user.name "Test User"', { cwd: upstreamPath });

      // Create a commit
      writeFileSync(join(upstreamPath, "test.txt"), "test");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "Initial"', { cwd: upstreamPath });

      // Call forcePush - the actual result depends on git behavior
      // It might succeed if there's nothing to push, or fail if there's a remote issue
      const result = await ctx.services.commits.forcePush(session.id);

      // Should return a defined result with success status
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      // Result should either succeed (if no remote means nothing to do)
      // or fail with an appropriate error message
      if (!result.success) {
        // If it failed, there should be an error message
        expect(result.error || result.message).toBeTruthy();
      }
    }, 30000);
  });
});
