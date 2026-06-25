import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { detectChangedFilesFromPatchPreview } from "../src/domain/commits/changed-files.js";
import { parsePatchPreview } from "../src/domain/commits/patch-preview.js";

describe("Commit Preview Performance", () => {
  let testHome: string;
  let os: any;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-preview-perf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });

    os = createOS({ ...process.env });

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
      os,
    });
  });

  describe("detectChangedFilesFromPatchPreview", () => {
    it("maps patch statuses to changed-file results with sizes", () => {
      const upstreamPath = join(testHome, "upstream");
      const workspacePath = join(testHome, "workspace");
      mkdirSync(upstreamPath, { recursive: true });
      mkdirSync(workspacePath, { recursive: true });

      writeFileSync(join(upstreamPath, "deleted.txt"), "old content");
      writeFileSync(join(workspacePath, "added.txt"), "new content");
      writeFileSync(join(upstreamPath, "modified.txt"), "original");
      writeFileSync(join(workspacePath, "modified.txt"), "changed");

      const patch = [
        "diff --git a/deleted.txt b/deleted.txt",
        "deleted file mode 100644",
        "index 123..456 100644",
        "--- a/deleted.txt",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-old content",
        "diff --git a/added.txt b/added.txt",
        "new file mode 100644",
        "index 000..789 100644",
        "--- /dev/null",
        "+++ b/added.txt",
        "@@ -0,0 +1 @@",
        "+new content",
        "diff --git a/modified.txt b/modified.txt",
        "index abc..def 100644",
        "--- a/modified.txt",
        "+++ b/modified.txt",
        "@@ -1 +1 @@",
        "-original",
        "+changed",
      ].join("\n");

      const preview = parsePatchPreview(patch);
      const result = detectChangedFilesFromPatchPreview(
        os,
        upstreamPath,
        workspacePath,
        preview,
      );

      expect(result.summary).toEqual({
        added: 1,
        modified: 1,
        deleted: 1,
      });

      expect(result.files).toHaveLength(3);

      const deletedFile = result.files.find((f) => f.path === "deleted.txt");
      expect(deletedFile?.status).toBe("deleted");
      expect(deletedFile?.size).toBeGreaterThan(0);

      const addedFile = result.files.find((f) => f.path === "added.txt");
      expect(addedFile?.status).toBe("added");
      expect(addedFile?.size).toBeGreaterThan(0);

      const modifiedFile = result.files.find((f) => f.path === "modified.txt");
      expect(modifiedFile?.status).toBe("modified");
      expect(modifiedFile?.size).toBeGreaterThan(0);
    });

    it("returns empty result for an empty patch", () => {
      const preview = parsePatchPreview("");
      const result = detectChangedFilesFromPatchPreview(
        os,
        join(testHome, "upstream"),
        join(testHome, "workspace"),
        preview,
      );

      expect(result.files).toHaveLength(0);
      expect(result.summary).toEqual({
        added: 0,
        modified: 0,
        deleted: 0,
      });
    });
  });

  describe("CommitService.getPreview with many unchanged files", () => {
    it("returns changed files quickly without scanning all unchanged files", async () => {
      const vcsModule = await import("../src/domain/vcs/index.ts");
      const VCS = vcsModule.VCS;
      const vcs = new VCS({ os });

      const { createMimoContext } =
        await import("../src/infrastructure/context/mimo-context.ts");
      const ctx = createMimoContext({
        env: {
          MIMO_HOME: testHome,
          JWT_SECRET: "test-secret-key-for-testing",
        },
        os,
      });

      const project = await ctx.repos.projects.create({
        name: "Perf Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await ctx.repos.sessions.create({
        name: "Perf Session",
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

      // Seed many unchanged files in both directories
      for (let i = 0; i < 200; i++) {
        const content = `unchanged content ${i}\n`.repeat(50);
        writeFileSync(join(upstreamPath, `unchanged-${i}.txt`), content);
        writeFileSync(join(agentWorkspacePath, `unchanged-${i}.txt`), content);
      }

      // Add a single changed file
      writeFileSync(join(agentWorkspacePath, "changed.txt"), "changed content");

      // Commit all files to fossil so they exist in workspace history
      await vcs.execCommand(["fossil", "addremove"], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Initial"],
        agentWorkspacePath,
      );

      const start = Date.now();
      const preview = await ctx.services.commits.getPreview(session.id);
      const duration = Date.now() - start;

      expect(preview.success).toBe(true);
      expect(preview.preview).toBeDefined();
      expect(
        preview.preview!.files.some(
          (f) => f.path === "changed.txt" && f.status === "added",
        ),
      ).toBe(true);

      // None of the unchanged files should appear in the preview
      const unchangedFiles = preview.preview!.files.filter((f) =>
        f.path.startsWith("unchanged-"),
      );
      expect(unchangedFiles).toHaveLength(0);

      // The preview should be fast even with 200 unchanged files.
      // The old implementation scanned every file; the patch-based
      // implementation only looks at the changed file.
      expect(duration).toBeLessThan(5000);
    }, 30000);

    it("commit and push is fast with many unchanged files", async () => {
      const vcsModule = await import("../src/domain/vcs/index.ts");
      const VCS = vcsModule.VCS;
      const vcs = new VCS({ os });

      const { createMimoContext } =
        await import("../src/infrastructure/context/mimo-context.ts");
      const ctx = createMimoContext({
        env: {
          MIMO_HOME: testHome,
          JWT_SECRET: "test-secret-key-for-testing",
        },
        os,
      });

      const project = await ctx.repos.projects.create({
        name: "Perf Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await ctx.repos.sessions.create({
        name: "Perf Session",
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

      for (let i = 0; i < 200; i++) {
        const content = `unchanged content ${i}\n`.repeat(50);
        writeFileSync(join(upstreamPath, `unchanged-${i}.txt`), content);
        writeFileSync(join(agentWorkspacePath, `unchanged-${i}.txt`), content);
      }

      writeFileSync(join(agentWorkspacePath, "changed.txt"), "changed content");

      await vcs.execCommand(["fossil", "addremove"], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Initial"],
        agentWorkspacePath,
      );

      const start = Date.now();
      const result = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "Perf commit",
        ["changed.txt"],
      );
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(existsSync(join(upstreamPath, "changed.txt"))).toBe(true);

      // Should finish quickly even with 200 unchanged files.
      expect(duration).toBeLessThan(5000);
    }, 30000);

    it("invalidates patch cache after a successful commit", async () => {
      const vcsModule = await import("../src/domain/vcs/index.ts");
      const VCS = vcsModule.VCS;
      const vcs = new VCS({ os });

      const { createMimoContext } =
        await import("../src/infrastructure/context/mimo-context.ts");
      const ctx = createMimoContext({
        env: {
          MIMO_HOME: testHome,
          JWT_SECRET: "test-secret-key-for-testing",
        },
        os,
      });

      const project = await ctx.repos.projects.create({
        name: "Cache Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await ctx.repos.sessions.create({
        name: "Cache Session",
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

      writeFileSync(join(agentWorkspacePath, "changed.txt"), "v1");
      await vcs.execCommand(["fossil", "addremove"], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Initial"],
        agentWorkspacePath,
      );

      // First preview shows the change.
      const previewBefore = await ctx.services.commits.getPreview(session.id);
      expect(previewBefore.preview!.files).toHaveLength(1);

      // Commit it.
      const commitResult = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "Cache commit",
        ["changed.txt"],
      );
      expect(commitResult.success).toBe(true);

      // Second preview should immediately show no changes because the
      // cache was invalidated after the commit.
      const previewAfter = await ctx.services.commits.getPreview(session.id);
      expect(previewAfter.preview!.files).toHaveLength(0);
    }, 30000);

    it("shares changed files with impact calculator to avoid re-scanning", async () => {
      const vcsModule = await import("../src/domain/vcs/index.ts");
      const VCS = vcsModule.VCS;
      const vcs = new VCS({ os });

      const { createMimoContext } =
        await import("../src/infrastructure/context/mimo-context.ts");
      const ctx = createMimoContext({
        env: {
          MIMO_HOME: testHome,
          JWT_SECRET: "test-secret-key-for-testing",
        },
        os,
      });

      const project = await ctx.repos.projects.create({
        name: "Shared Cache Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await ctx.repos.sessions.create({
        name: "Shared Cache Session",
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

      // Seed many unchanged files and one changed file.
      for (let i = 0; i < 200; i++) {
        const content = `unchanged content ${i}\n`.repeat(50);
        writeFileSync(join(upstreamPath, `unchanged-${i}.txt`), content);
        writeFileSync(join(agentWorkspacePath, `unchanged-${i}.txt`), content);
      }
      writeFileSync(join(agentWorkspacePath, "changed.txt"), "changed");

      await vcs.execCommand(["fossil", "addremove"], agentWorkspacePath);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Initial"],
        agentWorkspacePath,
      );

      // Loading the preview populates the shared changed-files cache.
      const preview = await ctx.services.commits.getPreview(session.id);
      expect(preview.preview!.files).toHaveLength(1);

      // Impact calculation should reuse the cached changed files, so it must
      // complete quickly without scanning 200 unchanged files.
      const start = Date.now();
      const impact = await ctx.services.impactCalculator.calculateImpact(
        session.id,
        upstreamPath,
        agentWorkspacePath,
      );
      const duration = Date.now() - start;

      expect(impact.metrics.files.new).toBe(1);
      expect(duration).toBeLessThan(5000);

      // Committing invalidates the shared cache.
      const commitResult = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "Shared cache commit",
        ["changed.txt"],
      );
      expect(commitResult.success).toBe(true);

      // After commit the cache is empty, so a fresh impact calculation without
      // explicit changed files falls back to a directory scan and still works.
      const impactAfter = await ctx.services.impactCalculator.calculateImpact(
        session.id,
        upstreamPath,
        agentWorkspacePath,
      );
      expect(impactAfter.metrics.files.new).toBe(0);
      expect(impactAfter.metrics.files.changed).toBe(0);
    }, 30000);

    it("detectChangedFiles uses async I/O and does not block the event loop", async () => {
      const { detectChangedFiles } =
        await import("../src/domain/files/changed-files.js");

      const upstreamPath = join(testHome, "upstream-async");
      const workspacePath = join(testHome, "workspace-async");
      mkdirSync(upstreamPath, { recursive: true });
      mkdirSync(workspacePath, { recursive: true });

      // Seed enough files that synchronous stat/readFile would be noticeable.
      for (let i = 0; i < 200; i++) {
        writeFileSync(
          join(upstreamPath, `file-${i}.txt`),
          `upstream content ${i}\n`.repeat(20),
        );
        writeFileSync(
          join(workspacePath, `file-${i}.txt`),
          `workspace content ${i}\n`.repeat(20),
        );
      }
      writeFileSync(join(workspacePath, "added.txt"), "added");

      let eventLoopFreed = false;
      const immediatePromise = new Promise<void>((resolve) => {
        setImmediate(() => {
          eventLoopFreed = true;
          resolve();
        });
      });

      const detectPromise = detectChangedFiles(os, upstreamPath, workspacePath);

      // Wait for both; if scan blocks the event loop, setImmediate will only
      // fire after detectChangedFiles finishes.
      const [, result] = await Promise.all([immediatePromise, detectPromise]);

      expect(eventLoopFreed).toBe(true);
      expect(result.files.length).toBeGreaterThan(0);
      expect(
        result.files.some(
          (f) => f.path === "added.txt" && f.status === "added",
        ),
      ).toBe(true);
    }, 30000);
  });
});
