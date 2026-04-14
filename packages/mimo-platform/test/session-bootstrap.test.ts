import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";

describe("Session Bootstrap Integration Tests", () => {
    let testHome: string;
    let projectsDir: string;
    let fossilReposDir: string;
  let VCS: any;
  let sessionRepository: any;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-bootstrap-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      projectsDir = join(testHome, "projects");
      fossilReposDir = join(testHome, "fossil-repos");
    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
    
    mkdirSync(testHome, { recursive: true });
      mkdirSync(projectsDir, { recursive: true });
      mkdirSync(fossilReposDir, { recursive: true });

    // Re-import to get fresh modules
    const vcsModule = await import("../src/vcs/index.ts");
    VCS = vcsModule.VCS;

    const sessionModule = await import("../src/sessions/repository.ts");
     sessionRepository = new sessionModule.SessionRepository({
          paths: {
              projects: projectsDir,
              data: testHome
          },
          fossilReposDir: fossilReposDir
      }
      );
  });

  afterEach(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  describe("Git Repository Bootstrap", () => {
    it("should clone a Git repository to upstream directory", async () => {
      const vcs = new VCS();
      const upstreamPath = join(testHome, "test-upstream");
      
      // Clone a small public repo
      const result = await vcs.cloneRepository(
        "https://github.com/octocat/Hello-World.git",
        "git",
        upstreamPath
      );

      expect(result.success).toBe(true);
      expect(existsSync(join(upstreamPath, ".git"))).toBe(true);
    }, 30000);

    it("should import Git repository to Fossil", async () => {
      const vcs = new VCS();
      const upstreamPath = join(testHome, "import-test");
      const fossilPath = join(testHome, "import-test.fossil");
      
      // Create a simple git repo
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      writeFileSync(join(upstreamPath, "README.md"), "# Test");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "Initial commit"', { cwd: upstreamPath });
      
      // Import to fossil
      const result = await vcs.importToFossil(upstreamPath, "git", fossilPath);
      
      expect(result.success).toBe(true);
      expect(existsSync(fossilPath)).toBe(true);
    }, 15000);

    it("should open Fossil checkout", async () => {
      const vcs = new VCS();
      const upstreamPath = join(testHome, "checkout-test");
      const fossilPath = join(testHome, "checkout-test.fossil");
      const agentWorkspacePath = join(testHome, "checkout");
      
      // Create a simple git repo
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      writeFileSync(join(upstreamPath, "README.md"), "# Test");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "Initial commit"', { cwd: upstreamPath });
      
      // Import to fossil
      await vcs.importToFossil(upstreamPath, "git", fossilPath);
      
      // Open checkout
      const result = await vcs.openFossilCheckout(fossilPath, agentWorkspacePath);
      
      expect(result.success).toBe(true);
      expect(existsSync(join(agentWorkspacePath, "README.md"))).toBe(true);
    }, 15000);

    it("should fail on invalid Git URL", async () => {
      const vcs = new VCS();
      const upstreamPath = join(testHome, "invalid-url");
      
      const result = await vcs.cloneRepository(
        "not-a-url",
        "git",
        upstreamPath
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 10000);
  });

  describe("Fossil Repository Bootstrap", () => {
    it("should clone a Fossil repository", async () => {
      const vcs = new VCS();
      
      // First create a fossil repo to clone from
      const sourcePath = join(testHome, "source.fossil");
      await vcs.createFossilRepo(sourcePath);
      
      const upstreamPath = join(testHome, "fossil-upstream");
      const result = await vcs.cloneFossil(sourcePath, upstreamPath);
      
      expect(result.success).toBe(true);
      expect(existsSync(join(upstreamPath, ".fossil"))).toBe(true);
    }, 15000);
  });

  describe("Session Repository", () => {
    it("should create session with upstream and checkout directories", async () => {
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: "test-project-id",
        owner: "testuser",
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.upstreamPath).toBeDefined();
      expect(session.agentWorkspacePath).toBeDefined();
      
      // Verify directories were created
      expect(existsSync(session.upstreamPath)).toBe(true);
      expect(existsSync(session.agentWorkspacePath)).toBe(true);
    });

    it("should store upstreamPath and agentWorkspacePath in session.yaml", async () => {
      const session = await sessionRepository.create({
        name: "Path Test",
        projectId: "test-project",
        owner: "testuser",
      });

      // Load the session again
      const loaded = await sessionRepository.findById(session.id);
      
      expect(loaded).not.toBeNull();
      expect(loaded?.upstreamPath).toBe(session.upstreamPath);
      expect(loaded?.agentWorkspacePath).toBe(session.agentWorkspacePath);
    });

    it("should store port as null on creation", async () => {
      const session = await sessionRepository.create({
        name: "Port Test",
        projectId: "test-project",
        owner: "testuser",
      });

      expect(session.port).toBeNull();

      // Load the session again
      const loaded = await sessionRepository.findById(session.id);
      expect(loaded?.port).toBeNull();
    });

    it("should delete session directory including upstream and checkout", async () => {
      const session = await sessionRepository.create({
        name: "Delete Test",
        projectId: "test-project",
        owner: "testuser",
      });

      // Verify paths exist
      expect(existsSync(session.upstreamPath)).toBe(true);
      expect(existsSync(session.agentWorkspacePath)).toBe(true);

      // Delete
      await sessionRepository.delete("test-project", session.id);

      // Verify deleted
      const loaded = await sessionRepository.findById(session.id);
      expect(loaded).toBeNull();
    });
  });

  describe("Full Bootstrap Flow", () => {
    it("should bootstrap a session from Git repository (repo.fossil only, no checkout)", async () => {
      const vcs = new VCS();
      const projectId = "full-bootstrap-test";
      const projectPath = join(testHome, "projects", projectId);
      mkdirSync(projectPath, { recursive: true });

      // Create session
      const session = await sessionRepository.create({
        name: "Full Bootstrap",
        projectId,
        owner: "testuser",
      });

      // Clone upstream
      const cloneResult = await vcs.cloneRepository(
        "https://github.com/octocat/Hello-World.git",
        "git",
        session.upstreamPath
      );
      expect(cloneResult.success).toBe(true);

      // Import to fossil
      const fossilPath = join(session.upstreamPath, "..", "repo.fossil");
      const importResult = await vcs.importToFossil(
        session.upstreamPath,
        "git",
        fossilPath
      );
      expect(importResult.success).toBe(true);

      // Verify fossil repo exists
      expect(existsSync(fossilPath)).toBe(true);

      // Verify session has port: null (not assigned yet)
      const loaded = await sessionRepository.findById(session.id);
      expect(loaded?.port).toBeNull();

      // Note: Checkout is NOT created by platform - agent will create it
    }, 60000);
  });
});
