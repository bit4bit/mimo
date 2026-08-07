import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";

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
      await import("../src/infrastructure/context/mimo-context.ts");
    ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });
  });

  describe("Commit Service Integration", () => {
    it("should have commit service with commitAndPush method", async () => {
      const { CommitService } =
        await import("../src/domain/commits/service.ts");

      // Verify the service class exists and mimoContext has the instance
      expect(CommitService).toBeDefined();
      expect(typeof CommitService).toBe("function");
      expect(ctx.services.commits).toBeDefined();
      expect(typeof ctx.services.commits.commitAndPush).toBe("function");
    });

    it("should have VCS service with required methods", async () => {
      const { VCS } = await import("../src/domain/vcs/index.ts");

      // Verify VCS class exists
      expect(VCS).toBeDefined();
      expect(ctx.services.vcs).toBeDefined();
      expect(typeof ctx.services.vcs.createFossilRepo).toBe("function");
      expect(typeof ctx.services.vcs.openFossil).toBe("function");
      expect(typeof ctx.services.vcs.commitUpstream).toBe("function");
    });

    it("should create repositories and sessions correctly", async () => {
      // Use repositories from mimoContext
      const sessionRepo = ctx.repos.sessions;
      const projectRepo = ctx.repos.projects;

      // Create a project
      const project = await projectRepo.create({
        repositories: [
          {
            id: "default",
            name: "default",
            repoUrl: "https://github.com/test/repo.git",
            repoType: "git",
            mountPath: ".",
          },
        ],

        name: "Test Project",
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

describe("Commit Service — impact record creation", () => {
  let savedRecords: any[] = [];

  beforeEach(() => {
    savedRecords = [];
  });

  it("SHOULD create impact record when commit succeeds", async () => {
    const { CommitService } = await import("../src/domain/commits/service.ts");

    // Build a real impactRepository spy that captures .save() calls
    const impactRepository = {
      findByProject: async () => savedRecords,
      findBySession: async () => savedRecords,
      findByCommitHash: async () => null,
      save: async (record: any) => {
        savedRecords.push(record);
      },
    };

    // Build a fake impact calculator that returns deterministic metrics
    const impactCalculator = {
      calculateImpact: async () => ({
        metrics: {
          files: { new: 1, changed: 2, deleted: 0, unchanged: 5 },
          linesOfCode: { added: 10, removed: 5, net: 5 },
          complexity: { cyclomatic: 3, cognitive: 1, estimatedMinutes: 10 },
          byLanguage: [
            {
              language: "ts",
              files: 3,
              linesAdded: 10,
              linesRemoved: 5,
              complexityDelta: 3,
            },
          ],
        },
      }),
    };

    // Fake VCS that simulates a successful commit with hash
    const vcs = {
      generatePatch: async () => ({
        success: true,
        patch: [
          "diff --git a/test.ts b/test.ts",
          "new file mode 100644",
          "index 000..abc",
          "--- /dev/null",
          "+++ b/test.ts",
          "@@ -0,0 +1 @@",
          "+export const a = 1;",
        ].join("\n"),
      }),
      storePatch: async () => {},
      commitUpstream: async () => ({
        success: true,
        output: "committed abc123def456",
        commitHash: "abc123def456",
      }),
      pushUpstream: async () => ({ success: true }),
    };

    // Fake OS
    const files = new Map<string, string>();
    files.set("/tmp/workspace/test.ts", "export const a = 1;\n");
    const os = {
      path: {
        join: (...parts: string[]) => parts.join("/"),
        dirname: (p: string) => p.split("/").slice(0, -1).join("/"),
        basename: (p: string) => p.split("/").pop() || "",
        relative: (from: string, to: string) => {
          if (to.startsWith(from)) return to.slice(from.length + 1);
          return to;
        },
      },
      fs: {
        exists: (p: string) =>
          files.has(p) || p === "/tmp/upstream" || p === "/tmp/workspace",
        mkdir: (_dir: string, _opts?: any) => {},
        readdir: (dir: string, _opts?: any) => {
          const entries: {
            name: string;
            isDirectory: () => boolean;
            isFile: () => boolean;
          }[] = [];
          for (const [path] of files) {
            if (path.startsWith(dir + "/")) {
              const relative = path.slice(dir.length + 1);
              const firstPart = relative.split("/")[0];
              if (firstPart && !entries.find((e) => e.name === firstPart)) {
                entries.push({
                  name: firstPart,
                  isDirectory: () => relative.includes("/"),
                  isFile: () => !relative.includes("/"),
                });
              }
            }
          }
          return entries;
        },
        readdirAsync: async (dir: string, _opts?: any) => {
          const entries: {
            name: string;
            isDirectory: () => boolean;
            isFile: () => boolean;
          }[] = [];
          for (const [path] of files) {
            if (path.startsWith(dir + "/")) {
              const relative = path.slice(dir.length + 1);
              const firstPart = relative.split("/")[0];
              if (firstPart && !entries.find((e) => e.name === firstPart)) {
                entries.push({
                  name: firstPart,
                  isDirectory: () => relative.includes("/"),
                  isFile: () => !relative.includes("/"),
                });
              }
            }
          }
          return entries;
        },
        mkdirAsync: async (_dir: string, _opts?: any) => {},
        renameAsync: async (_src: string, _dest: string) => {},
        lstat: (p: string) => ({
          isDirectory: () => !files.has(p),
          isFile: () => files.has(p),
          isSymbolicLink: () => false,
          size: (files.get(p) || "").length,
          mtimeMs: 0,
        }),
        lstatAsync: async (p: string) => ({
          isDirectory: () => !files.has(p),
          isFile: () => files.has(p),
          isSymbolicLink: () => false,
          size: (files.get(p) || "").length,
          mtimeMs: 0,
        }),
        stat: (p: string) => ({
          isFile: () => files.has(p),
          isDirectory: () => !files.has(p),
          size: (files.get(p) || "").length,
          mtimeMs: 0,
        }),
        statAsync: async (p: string) => ({
          isFile: () => files.has(p),
          isDirectory: () => !files.has(p),
          size: (files.get(p) || "").length,
          mtimeMs: 0,
        }),
        existsAsync: async (p: string) =>
          files.has(p) || p === "/tmp/upstream" || p === "/tmp/workspace",
        readFile: (p: string, _encoding?: string) => files.get(p) || "",
        readFileAsync: async (p: string, _encoding?: string) =>
          files.get(p) || "",
        writeFile: (_p: string, _content: string) => {},
        writeFileAsync: async (_p: string, _content: string) => {},
        copyFile: (src: string, dest: string) => {
          const content = files.get(src);
          if (content) files.set(dest, content);
        },
        copyFileAsync: async (src: string, dest: string) => {
          const content = files.get(src);
          if (content) files.set(dest, content);
        },
        unlink: (_p: string) => {},
        unlinkAsync: async (_p: string) => {},
        rm: (_p: string, _opts?: any) => {},
        rmAsync: async (_p: string, _opts?: any) => {},
      },
      child_process: {
        execSync: () => "",
        spawn: () => ({}) as any,
      },
      command: {
        run: async () => ({
          success: true,
          output: "mock command output",
          error: "",
        }),
      },
      env: {
        get: () => undefined,
        getAll: () => ({}),
      },
    };

    const session = {
      id: "session-1",
      name: "Test Session",
      projectId: "project-1",
      upstreamPath: "/tmp/upstream",
      agentWorkspacePath: "/tmp/workspace",
      branch: null,
      clonePort: null,
      repos: [
        {
          projectRepoId: "default",
          upstreamPath: "/tmp/upstream",
          workspacePath: "/tmp/workspace",
        },
      ],
    };

    const project = {
      id: "project-1",
      repoType: "fossil",
      newBranch: null,
      credentialId: null,
      owner: "testuser",
      repositories: [
        {
          id: "default",
          name: "Test Project",
          repoUrl: "http://repo.fossil",
          repoType: "fossil",
          mountPath: ".",
          primary: true,
        },
      ],
    };

    const sessionRepository = {
      findById: async () => session,
      update: async () => session,
    };

    const projectRepository = {
      findById: async () => project,
    };

    const credentialRepository = {
      findById: async () => null,
    };

    const service = new CommitService({
      sessionRepository,
      projectRepository,
      credentialRepository,
      impactRepository,
      impactCalculator,
      vcs,
      os,
    });

    const result = await service.commitAndPush("session-1", "test commit");
    expect(result.success).toBe(true);

    // Core assertion: impact record was saved
    expect(savedRecords.length).toBe(1);
    const record = savedRecords[0];
    expect(record.sessionId).toBe("session-1");
    expect(record.projectId).toBe("project-1");
    expect(record.sessionName).toBe("Test Session");
    expect(record.commitHash).toBe("abc123def456");
    expect(record.files).toEqual({ new: 1, changed: 2, deleted: 0 });
    expect(record.linesOfCode).toEqual({ added: 10, removed: 5, net: 5 });
    expect(record.complexity).toEqual({
      cyclomatic: 3,
      cognitive: 1,
      estimatedMinutes: 10,
    });
    expect(record.complexityByLanguage).toEqual([
      {
        language: "ts",
        files: 3,
        linesAdded: 10,
        linesRemoved: 5,
        complexityDelta: 3,
      },
    ]);
    expect(record.commitDate).toBeInstanceOf(Date);
    expect(record.id).toBeDefined();
  });
});
