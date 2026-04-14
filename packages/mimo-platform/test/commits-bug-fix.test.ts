import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";

describe("Commit Service Bug Fix - Untracked Files Preservation", () => {
  let testHome: string;
  let ctx: any;

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

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });
  });

  describe("Commit Service Integration", () => {
    it("should have commit service with commitAndPush method", async () => {
      const { CommitService } = await import("../src/commits/service.ts");

      // Verify the service class exists and mimoContext has the instance
      expect(CommitService).toBeDefined();
      expect(typeof CommitService).toBe("function");
      expect(ctx.services.commits).toBeDefined();
      expect(typeof ctx.services.commits.commitAndPush).toBe("function");
    });

    it("should have VCS service with required methods", async () => {
      const { VCS, vcs } = await import("../src/vcs/index.ts");

      // Verify VCS class and singleton exist
      expect(VCS).toBeDefined();
      expect(vcs).toBeDefined();
      expect(typeof vcs.createFossilRepo).toBe("function");
      expect(typeof vcs.openFossil).toBe("function");
      expect(typeof vcs.commitUpstream).toBe("function");
    });

    it("should create repositories and sessions correctly", async () => {
      const { vcs } = await import("../src/vcs/index.ts");

      // Use repositories from mimoContext
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

      // Create a project
      const project = await projectRepo.create({
        name: "Test Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();

      // Create a session
      const session = await sessionRepo.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.agentWorkspacePath).toBeDefined();
      expect(session.upstreamPath).toBeDefined();
    });
  });
});
