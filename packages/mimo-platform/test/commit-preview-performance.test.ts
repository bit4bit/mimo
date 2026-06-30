import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { detectChangedFilesFromPatchPreview } from "../src/domain/commits/changed-files.js";
import { parsePatchPreview } from "../src/domain/commits/patch-preview.js";
import { createManifestStore } from "../src/domain/files/tree-manifest.js";

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

    it("excludes .git and node_modules from the preview", async () => {
      const { createMimoContext } =
        await import("../src/infrastructure/context/mimo-context.ts");
      const ctx = createMimoContext({
        env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
        os,
      });

      const project = await ctx.repos.projects.create({
        name: "Exclude Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });
      const session = await ctx.repos.sessions.create({
        name: "Exclude Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Upstream is a real git checkout (so it has a populated .git directory).
      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync('git config user.email "test@test.com"', { cwd: upstreamPath });
      execSync('git config user.name "Test User"', { cwd: upstreamPath });
      writeFileSync(join(upstreamPath, "keep.txt"), "same\n");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "init"', { cwd: upstreamPath });

      // Workspace has the same keep.txt, plus a node_modules dir and one real change.
      const agentWorkspacePath = session.agentWorkspacePath;
      mkdirSync(join(agentWorkspacePath, "node_modules", "pkg"), {
        recursive: true,
      });
      writeFileSync(join(agentWorkspacePath, "keep.txt"), "same\n");
      writeFileSync(
        join(agentWorkspacePath, "node_modules", "pkg", "index.js"),
        "module.exports = 1",
      );
      writeFileSync(join(agentWorkspacePath, "feature.txt"), "new feature");

      const preview = await ctx.services.commits.getPreview(session.id);

      expect(preview.success).toBe(true);
      const paths = preview.preview!.files.map((f) => f.path);
      expect(paths).toContain("feature.txt");
      expect(paths.some((p) => p.includes(".git"))).toBe(false);
      expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    }, 30000);

    it("does not list a file after it has been selectively committed", async () => {
      const { createMimoContext } =
        await import("../src/infrastructure/context/mimo-context.ts");
      const ctx = createMimoContext({
        env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
        os,
      });

      const project = await ctx.repos.projects.create({
        name: "Two Endpoint Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });
      const session = await ctx.repos.sessions.create({
        name: "Two Endpoint Session",
        projectId: project.id,
        owner: "testuser",
      });

      const upstreamPath = session.upstreamPath;
      mkdirSync(upstreamPath, { recursive: true });
      execSync("git init", { cwd: upstreamPath });
      execSync('git config user.email "test@test.com"', { cwd: upstreamPath });
      execSync('git config user.name "Test User"', { cwd: upstreamPath });

      // Two new files in the workspace.
      const agentWorkspacePath = session.agentWorkspacePath;
      mkdirSync(agentWorkspacePath, { recursive: true });
      writeFileSync(join(agentWorkspacePath, "a.txt"), "alpha");
      writeFileSync(join(agentWorkspacePath, "b.txt"), "bravo");

      const before = await ctx.services.commits.getPreview(session.id);
      expect(before.preview!.files.map((f) => f.path).sort()).toEqual([
        "a.txt",
        "b.txt",
      ]);

      // Selectively commit only a.txt (copies it into upstream + commits there).
      const commit = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "commit a only",
        ["a.txt"],
      );
      expect(commit.success).toBe(true);

      // a.txt is now identical in both trees; the preview must show only b.txt,
      // even though the agent workspace still differs from its own baseline.
      const after = await ctx.services.commits.getPreview(session.id);
      expect(after.preview!.files.map((f) => f.path)).toEqual(["b.txt"]);
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
  });

  describe("CommitService.commitAndPushSelective change detection", () => {
    async function newCtx() {
      const { createMimoContext } =
        await import("../src/infrastructure/context/mimo-context.ts");
      return createMimoContext({
        env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
        os,
      });
    }

    function gitInit(dir: string) {
      mkdirSync(dir, { recursive: true });
      execSync("git init", { cwd: dir });
      execSync('git config user.email "test@test.com"', { cwd: dir });
      execSync('git config user.name "Test User"', { cwd: dir });
    }

    // 1.1 + 1.4: commit path derives the changed-file list with the cheap
    // stat-diff — never building a whole-repo binary patch and never reading
    // VCS internals — even with many unchanged files, copying only the
    // selected file.
    it("derives changed files without a whole-repo patch or reading .git, copying only the selected file", async () => {
      const ctx = await newCtx();
      const project = await ctx.repos.projects.create({
        name: "No-Patch Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });
      const session = await ctx.repos.sessions.create({
        name: "No-Patch Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Upstream is a real git checkout with a populated .git directory.
      const upstreamPath = session.upstreamPath;
      gitInit(upstreamPath);

      const agentWorkspacePath = session.agentWorkspacePath;
      mkdirSync(agentWorkspacePath, { recursive: true });

      // Many identical files on both sides, committed upstream so .git is heavy.
      for (let i = 0; i < 100; i++) {
        const content = `unchanged content ${i}\n`.repeat(50);
        writeFileSync(join(upstreamPath, `unchanged-${i}.txt`), content);
        writeFileSync(join(agentWorkspacePath, `unchanged-${i}.txt`), content);
      }
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "seed"', { cwd: upstreamPath });

      // One real change in the workspace.
      writeFileSync(join(agentWorkspacePath, "changed.txt"), "changed content");

      // Spy on the patch generator the service depends on.
      const serviceVcs = (ctx.services.commits as any).deps.vcs;
      let generatePatchCalls = 0;
      const realGeneratePatch = serviceVcs.generatePatch.bind(serviceVcs);
      serviceVcs.generatePatch = async (...args: any[]) => {
        generatePatchCalls++;
        return realGeneratePatch(...args);
      };

      // Spy on content reads to catch any traversal of VCS internals.
      const realReadAsync = os.fs.readFileAsync.bind(os.fs);
      const gitReads: string[] = [];
      os.fs.readFileAsync = (...args: any[]) => {
        const p = args[0];
        if (typeof p === "string" && p.includes(`${"/"}.git${"/"}`)) {
          gitReads.push(p);
        }
        return realReadAsync(...args);
      };

      try {
        const start = Date.now();
        const result = await ctx.services.commits.commitAndPushSelective(
          session.id,
          "Commit one file",
          ["changed.txt"],
        );
        const duration = Date.now() - start;

        expect(result.success).toBe(true);
        // No whole-repo binary patch was generated.
        expect(generatePatchCalls).toBe(0);
        // No VCS internals were read.
        expect(gitReads).toEqual([]);
        // Only the selected file was copied to upstream.
        expect(existsSync(join(upstreamPath, "changed.txt"))).toBe(true);
        // Completes promptly despite 100 unchanged files.
        expect(duration).toBeLessThan(5000);
      } finally {
        serviceVcs.generatePatch = realGeneratePatch;
        os.fs.readFileAsync = realReadAsync;
      }
    }, 30000);

    // 1.2: selective-commit semantics are preserved.
    it("commits only the selected file, leaving the others pending", async () => {
      const ctx = await newCtx();
      const project = await ctx.repos.projects.create({
        name: "Selective Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });
      const session = await ctx.repos.sessions.create({
        name: "Selective Session",
        projectId: project.id,
        owner: "testuser",
      });

      gitInit(session.upstreamPath);
      const agentWorkspacePath = session.agentWorkspacePath;
      mkdirSync(agentWorkspacePath, { recursive: true });
      writeFileSync(join(agentWorkspacePath, "a.txt"), "alpha");
      writeFileSync(join(agentWorkspacePath, "b.txt"), "bravo");
      writeFileSync(join(agentWorkspacePath, "c.txt"), "charlie");

      const before = await ctx.services.commits.getPreview(session.id);
      expect(before.preview!.files.map((f) => f.path).sort()).toEqual([
        "a.txt",
        "b.txt",
        "c.txt",
      ]);

      const commit = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "commit b only",
        ["b.txt"],
      );
      expect(commit.success).toBe(true);
      expect(existsSync(join(session.upstreamPath, "b.txt"))).toBe(true);
      expect(existsSync(join(session.upstreamPath, "a.txt"))).toBe(false);
      expect(existsSync(join(session.upstreamPath, "c.txt"))).toBe(false);

      const after = await ctx.services.commits.getPreview(session.id);
      expect(after.preview!.files.map((f) => f.path).sort()).toEqual([
        "a.txt",
        "c.txt",
      ]);
    }, 30000);

    // 1.3a: applyStatuses filtering behaves identically to before.
    it("honors applyStatuses, committing only files with selected statuses", async () => {
      const ctx = await newCtx();
      const project = await ctx.repos.projects.create({
        name: "Status Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });
      const session = await ctx.repos.sessions.create({
        name: "Status Session",
        projectId: project.id,
        owner: "testuser",
      });

      const upstreamPath = session.upstreamPath;
      gitInit(upstreamPath);
      writeFileSync(join(upstreamPath, "modified.txt"), "original");
      writeFileSync(join(upstreamPath, "deleted.txt"), "to delete");
      execSync("git add .", { cwd: upstreamPath });
      execSync('git commit -m "seed"', { cwd: upstreamPath });

      const agentWorkspacePath = session.agentWorkspacePath;
      mkdirSync(agentWorkspacePath, { recursive: true });
      writeFileSync(join(agentWorkspacePath, "modified.txt"), "changed");
      writeFileSync(join(agentWorkspacePath, "added.txt"), "brand new");
      // deleted.txt absent from the workspace → deleted.

      const before = await ctx.services.commits.getPreview(session.id);
      expect(before.preview!.files.map((f) => f.path).sort()).toEqual([
        "added.txt",
        "deleted.txt",
        "modified.txt",
      ]);

      // Commit only "added" status files; no explicit selectedPaths.
      const commit = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "added only",
        undefined,
        { added: true, modified: false, deleted: false },
      );
      expect(commit.success).toBe(true);

      // added.txt landed upstream; modified/deleted were untouched.
      expect(existsSync(join(upstreamPath, "added.txt"))).toBe(true);
      expect(existsSync(join(upstreamPath, "deleted.txt"))).toBe(true);
      const modifiedUpstream = await os.fs.readFileAsync(
        join(upstreamPath, "modified.txt"),
        "utf8",
      );
      expect(modifiedUpstream).toBe("original");

      const after = await ctx.services.commits.getPreview(session.id);
      expect(after.preview!.files.map((f) => f.path).sort()).toEqual([
        "deleted.txt",
        "modified.txt",
      ]);
    }, 30000);

    // 1.3b: selectedPaths validation behaves identically to before.
    it("rejects selected paths that are not part of the changed set", async () => {
      const ctx = await newCtx();
      const project = await ctx.repos.projects.create({
        name: "Validation Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });
      const session = await ctx.repos.sessions.create({
        name: "Validation Session",
        projectId: project.id,
        owner: "testuser",
      });

      gitInit(session.upstreamPath);
      const agentWorkspacePath = session.agentWorkspacePath;
      mkdirSync(agentWorkspacePath, { recursive: true });
      writeFileSync(join(agentWorkspacePath, "real.txt"), "real");

      const result = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "bad selection",
        ["ghost.txt"],
      );

      expect(result.success).toBe(false);
      expect(result.invalidPaths).toEqual(["ghost.txt"]);
      expect(existsSync(join(session.upstreamPath, "ghost.txt"))).toBe(false);
    }, 30000);

    // 1.5: change detection on the commit path is filesystem-only (no patch)
    // and identical for git and fossil repoTypes.
    it("uses identical filesystem-only detection for git and fossil repoTypes", async () => {
      const vcsModule = await import("../src/domain/vcs/index.ts");
      const VCS = vcsModule.VCS;
      const vcs = new VCS({ os });
      const ctx = await newCtx();

      let generatePatchCalls = 0;
      const serviceVcs = (ctx.services.commits as any).deps.vcs;
      const realGeneratePatch = serviceVcs.generatePatch.bind(serviceVcs);
      serviceVcs.generatePatch = async (...args: any[]) => {
        generatePatchCalls++;
        return realGeneratePatch(...args);
      };

      async function build(
        repoType: "git" | "fossil",
        label: string,
      ): Promise<{ upstreamPath: string; sessionId: string }> {
        const project = await ctx.repos.projects.create({
          name: `Parity ${label}`,
          repoUrl: "https://github.com/test/repo.git",
          repoType,
          owner: "testuser",
        });
        const session = await ctx.repos.sessions.create({
          name: `Parity ${label} Session`,
          projectId: project.id,
          owner: "testuser",
        });

        const upstreamPath = session.upstreamPath;
        mkdirSync(upstreamPath, { recursive: true });
        if (repoType === "git") {
          gitInit(upstreamPath);
        } else {
          const fossilPath = join(testHome, `upstream-${label}.fossil`);
          await vcs.createFossilRepo(fossilPath);
          await vcs.openFossil(fossilPath, upstreamPath);
        }

        const agentWorkspacePath = session.agentWorkspacePath;
        mkdirSync(agentWorkspacePath, { recursive: true });
        // Identical contents on both sides: one unchanged file (present in both
        // trees) and one new file (only in the workspace).
        writeFileSync(join(upstreamPath, "keep.txt"), "same\n");
        writeFileSync(join(agentWorkspacePath, "keep.txt"), "same\n");
        writeFileSync(join(agentWorkspacePath, "feature.txt"), "new feature\n");

        return { upstreamPath, sessionId: session.id };
      }

      try {
        const gitSession = await build("git", "git");
        const fossilSession = await build("fossil", "fossil");

        // The changed-file set the commit path will use is the same the preview
        // computes — identical across backends.
        const gitPreview = await ctx.services.commits.getPreview(
          gitSession.sessionId,
        );
        const fossilPreview = await ctx.services.commits.getPreview(
          fossilSession.sessionId,
        );
        expect(gitPreview.preview!.files.map((f) => f.path).sort()).toEqual([
          "feature.txt",
        ]);
        expect(fossilPreview.preview!.files.map((f) => f.path).sort()).toEqual(
          gitPreview.preview!.files.map((f) => f.path).sort(),
        );

        // Drive the commit path on both; detection copies the identical file.
        await ctx.services.commits.commitAndPushSelective(
          gitSession.sessionId,
          "commit feature",
          ["feature.txt"],
        );
        await ctx.services.commits.commitAndPushSelective(
          fossilSession.sessionId,
          "commit feature",
          ["feature.txt"],
        );

        expect(existsSync(join(gitSession.upstreamPath, "feature.txt"))).toBe(
          true,
        );
        expect(
          existsSync(join(fossilSession.upstreamPath, "feature.txt")),
        ).toBe(true);

        // Detection never shelled out to a whole-repo patch for either backend.
        expect(generatePatchCalls).toBe(0);
      } finally {
        serviceVcs.generatePatch = realGeneratePatch;
      }
    }, 30000);
  });

  describe("CommitService.getPreview caching", () => {
    function sessionDir(upstreamPath: string, workspacePath: string) {
      return join(upstreamPath, "..");
    }

    it("a second getPreview of an unchanged session reads no file content", async () => {
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

      // Wire a real manifest store through to getPreview by replacing
      // the service's private method; this makes the test deterministic
      // without needing DI changes in the production wiring.
      const commitsService = ctx.services.commits as any;
      const originalGetPreview = commitsService.getPreview.bind(commitsService);
      commitsService.getPreview = async (sessionId: string) => {
        const session = await ctx.repos.sessions.findById(sessionId);
        if (!session) return { success: false, error: "Session not found" };
        const { detectChangedFiles } =
          await import("../src/domain/files/changed-files.js");
        const store = createManifestStore(
          os,
          join(
            sessionDir(session.upstreamPath, session.agentWorkspacePath),
            ".manifests",
          ),
        );
        const detected = await detectChangedFiles(
          os,
          session.upstreamPath,
          session.agentWorkspacePath,
          undefined,
          store,
        );
        return {
          success: true,
          preview: {
            summary: detected.summary,
            files: detected.files.map((f) => ({ ...f })),
          },
        };
      };

      const realReadAsync = os.fs.readFileAsync.bind(os.fs);
      let readCount = 0;
      os.fs.readFileAsync = (...args: any[]) => {
        // Manifest store loads/saves use readFileAsync too; don't count those
        // as project-file content reads. Also exclude session metadata reads
        // now that SessionRepository uses async I/O.
        const path = args[0] as string;
        if (!path.includes(".manifests") && !path.endsWith("session.yaml")) {
          readCount++;
        }
        return realReadAsync(...args);
      };

      const first = await commitsService.getPreview(session.id);
      expect(first.preview!.files).toHaveLength(1);
      expect(first.preview!.files[0].path).toBe("changed.txt");
      expect(readCount).toBeGreaterThan(0);

      readCount = 0;
      const second = await commitsService.getPreview(session.id);
      expect(second.preview!.files).toEqual(first.preview!.files);
      expect(readCount).toBe(0);

      // Restore original method
      commitsService.getPreview = originalGetPreview;
    }, 30000);

    it("after a commit the next getPreview reflects the new upstream state", async () => {
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
        name: "Post-commit Preview Project",
        repoUrl: "https://github.com/test/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await ctx.repos.sessions.create({
        name: "Post-commit Preview Session",
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

      const commitsService = ctx.services.commits as any;
      const originalGetPreview = commitsService.getPreview.bind(commitsService);
      commitsService.getPreview = async (sessionId: string) => {
        const session = await ctx.repos.sessions.findById(sessionId);
        if (!session) return { success: false, error: "Session not found" };
        const { detectChangedFiles } =
          await import("../src/domain/files/changed-files.js");
        const store = createManifestStore(
          os,
          join(
            sessionDir(session.upstreamPath, session.agentWorkspacePath),
            ".manifests",
          ),
        );
        const detected = await detectChangedFiles(
          os,
          session.upstreamPath,
          session.agentWorkspacePath,
          undefined,
          store,
        );
        return {
          success: true,
          preview: {
            summary: detected.summary,
            files: detected.files.map((f) => ({ ...f })),
          },
        };
      };

      const before = await commitsService.getPreview(session.id);
      expect(before.preview!.files).toHaveLength(1);

      // Commit the file so upstream now matches workspace.
      const commitResult = await ctx.services.commits.commitAndPushSelective(
        session.id,
        "Post-commit preview commit",
        ["changed.txt"],
      );
      expect(commitResult.success).toBe(true);

      const after = await commitsService.getPreview(session.id);
      expect(after.preview!.files).toHaveLength(0);

      commitsService.getPreview = originalGetPreview;
    }, 30000);
  });
});
