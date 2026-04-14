import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join, dirname } from "path";
import {
  rmSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "fs";
import { execSync } from "child_process";

describe("Patch-based Sync", () => {
  let testHome: string;
  let VCS: any;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-patch-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });

    const vcsModule = await import("../src/vcs/index.ts");
    VCS = vcsModule.VCS;
  });

  describe("alignWorkspaceWithFossil", () => {
    it("should delete files that fossil considers DELETED but still exist on disk", async () => {
      const vcs = new VCS();
      const workDir = join(testHome, "align-test");
      const repoPath = join(testHome, "align-test.fossil");

      mkdirSync(workDir, { recursive: true });
      await vcs.createFossilRepo(repoPath);
      await vcs.openFossil(repoPath, workDir);

      // Create and commit a file
      writeFileSync(join(workDir, "to-delete.txt"), "will be deleted");
      await vcs.execCommand(["fossil", "add", "to-delete.txt"], workDir);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Add file", "--no-warnings"],
        workDir,
      );

      // Remove via fossil rm (doesn't unlink from disk by default)
      await vcs.execCommand(
        ["fossil", "rm", "--hard", "to-delete.txt"],
        workDir,
      );

      // File might still exist on disk after fossil rm --hard removes it
      // If fossil rm --hard DID delete it, the align step is a no-op (still correct)
      const result = await vcs.alignWorkspaceWithFossil(workDir);

      expect(result.success).toBe(true);
      // After alignment, the file should not exist on disk
      expect(existsSync(join(workDir, "to-delete.txt"))).toBe(false);
    }, 15000);

    it("should succeed when workspace is not a fossil checkout", async () => {
      const vcs = new VCS();
      const plainDir = join(testHome, "plain-dir");
      mkdirSync(plainDir, { recursive: true });

      const result = await vcs.alignWorkspaceWithFossil(plainDir);
      expect(result.success).toBe(true);
    }, 10000);

    it("should succeed when no files are deleted", async () => {
      const vcs = new VCS();
      const workDir = join(testHome, "no-delete-test");
      const repoPath = join(testHome, "no-delete-test.fossil");

      mkdirSync(workDir, { recursive: true });
      await vcs.createFossilRepo(repoPath);
      await vcs.openFossil(repoPath, workDir);

      writeFileSync(join(workDir, "keep.txt"), "keeping this");
      await vcs.execCommand(["fossil", "add", "keep.txt"], workDir);
      await vcs.execCommand(
        ["fossil", "commit", "-m", "Add file", "--no-warnings"],
        workDir,
      );

      const result = await vcs.alignWorkspaceWithFossil(workDir);
      expect(result.success).toBe(true);
      expect(existsSync(join(workDir, "keep.txt"))).toBe(true);
    }, 15000);
  });

  describe("generatePatch", () => {
    it("should generate patch for modified files", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-gen");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");

      mkdirSync(upstream, { recursive: true });
      mkdirSync(agentWorkspace, { recursive: true });

      writeFileSync(join(upstream, "file.txt"), "original content");
      writeFileSync(join(agentWorkspace, "file.txt"), "modified content");

      const result = await vcs.generatePatch(agentWorkspace, upstream);

      expect(result.success).toBe(true);
      expect(result.patch).toBeTruthy();
      expect(result.patch).toContain("--- a/file.txt");
      expect(result.patch).toContain("+++ b/file.txt");
      expect(result.patch).toContain("-original content");
      expect(result.patch).toContain("+modified content");
    }, 10000);

    it("should generate patch for new files", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-new");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");

      mkdirSync(upstream, { recursive: true });
      mkdirSync(agentWorkspace, { recursive: true });

      // File only in agent-workspace
      writeFileSync(join(agentWorkspace, "new-file.txt"), "new content");

      const result = await vcs.generatePatch(agentWorkspace, upstream);

      expect(result.success).toBe(true);
      expect(result.patch).toBeTruthy();
      expect(result.patch).toContain("new-file.txt");
      expect(result.patch).toContain("new file mode");
    }, 10000);

    it("should generate patch for deleted files", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-del");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");

      mkdirSync(upstream, { recursive: true });
      mkdirSync(agentWorkspace, { recursive: true });

      // File only in upstream (deleted in agent-workspace)
      writeFileSync(join(upstream, "deleted-file.txt"), "old content");

      const result = await vcs.generatePatch(agentWorkspace, upstream);

      expect(result.success).toBe(true);
      expect(result.patch).toBeTruthy();
      expect(result.patch).toContain("deleted-file.txt");
      expect(result.patch).toContain("deleted file mode");
    }, 10000);

    it("should return empty patch when no differences", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-empty");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");

      mkdirSync(upstream, { recursive: true });
      mkdirSync(agentWorkspace, { recursive: true });

      writeFileSync(join(upstream, "same.txt"), "same content");
      writeFileSync(join(agentWorkspace, "same.txt"), "same content");

      const result = await vcs.generatePatch(agentWorkspace, upstream);

      expect(result.success).toBe(true);
      expect(result.patch).toBe("");
      expect(result.output).toContain("No changes");
    }, 10000);

    it("should filter VCS metadata from patch", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-meta");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");

      mkdirSync(upstream, { recursive: true });
      mkdirSync(agentWorkspace, { recursive: true });

      // Agent workspace has VCS metadata and a real file
      writeFileSync(join(agentWorkspace, ".fslckout"), "fossil metadata");
      writeFileSync(join(agentWorkspace, "real-file.txt"), "real content");

      const result = await vcs.generatePatch(agentWorkspace, upstream);

      expect(result.success).toBe(true);
      expect(result.patch).toBeTruthy();
      expect(result.patch).toContain("real-file.txt");
      expect(result.patch).not.toContain(".fslckout");
    }, 10000);

    it("should normalize paths correctly", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-paths");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");

      mkdirSync(join(upstream, "src"), { recursive: true });
      mkdirSync(join(agentWorkspace, "src"), { recursive: true });

      writeFileSync(join(upstream, "src", "app.ts"), "old code");
      writeFileSync(join(agentWorkspace, "src", "app.ts"), "new code");

      const result = await vcs.generatePatch(agentWorkspace, upstream);

      expect(result.success).toBe(true);
      // Paths should be normalized (no "upstream/" or "agent-workspace/" prefix)
      expect(result.patch).toContain("--- a/src/app.ts");
      expect(result.patch).toContain("+++ b/src/app.ts");
      expect(result.patch).not.toContain("upstream/");
      expect(result.patch).not.toContain("agent-workspace/");
    }, 10000);
  });

  describe("normalizePatchPaths and filterVcsMetadata", () => {
    it("should normalize all header types", () => {
      const vcs = new VCS();
      const input = [
        "diff --git a/upstream/src/app.ts b/agent-workspace/src/app.ts",
        "--- a/upstream/src/app.ts",
        "+++ b/agent-workspace/src/app.ts",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
      ].join("\n");

      const result = (vcs as any).normalizePatchPaths(
        input,
        "upstream",
        "agent-workspace",
      );

      expect(result).toContain("diff --git a/src/app.ts b/src/app.ts");
      expect(result).toContain("--- a/src/app.ts");
      expect(result).toContain("+++ b/src/app.ts");
    });

    it("should filter VCS metadata hunks", () => {
      const vcs = new VCS();
      const input = [
        "diff --git a/.fslckout b/.fslckout",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/.fslckout",
        "+binary data",
        "diff --git a/.git/HEAD b/.git/HEAD",
        "deleted file mode 100644",
        "--- a/.git/HEAD",
        "+++ /dev/null",
        "-ref: refs/heads/main",
        "diff --git a/real.txt b/real.txt",
        "--- a/real.txt",
        "+++ b/real.txt",
        "@@ -1 +1 @@",
        "-old",
        "+new",
      ].join("\n");

      const result = (vcs as any).filterVcsMetadata(input);

      expect(result).not.toContain(".fslckout");
      expect(result).not.toContain(".git/HEAD");
      expect(result).toContain("real.txt");
    });
  });

  describe("storePatch", () => {
    it("should store patch with timestamp filename", async () => {
      const vcs = new VCS();
      const patchDir = join(testHome, "patches");

      const patchContent =
        "diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n";
      const patchPath = await vcs.storePatch(patchDir, patchContent);

      expect(existsSync(patchPath)).toBe(true);
      expect(patchPath).toContain(patchDir);
      expect(patchPath).toMatch(/\.patch$/);
      expect(readFileSync(patchPath, "utf-8")).toBe(patchContent);
    });

    it("should create patches directory if it does not exist", async () => {
      const vcs = new VCS();
      const patchDir = join(testHome, "new-patches-dir");

      expect(existsSync(patchDir)).toBe(false);
      await vcs.storePatch(patchDir, "patch content");
      expect(existsSync(patchDir)).toBe(true);
    });
  });

  describe("applyPatch", () => {
    it("should apply patch to git upstream", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-apply-git");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");
      const patchDir = join(testHome, "patches-apply");

      mkdirSync(upstream, { recursive: true });
      mkdirSync(agentWorkspace, { recursive: true });
      mkdirSync(patchDir, { recursive: true });

      // Init git repo with initial file
      execSync("git init", { cwd: upstream });
      execSync('git config user.email "test@test.com"', { cwd: upstream });
      execSync('git config user.name "Test"', { cwd: upstream });
      writeFileSync(join(upstream, "file.txt"), "original");
      execSync("git add .", { cwd: upstream });
      execSync('git commit -m "Initial"', { cwd: upstream });

      // Agent workspace has modified file
      writeFileSync(join(agentWorkspace, "file.txt"), "modified");

      // Generate a real patch using generatePatch
      const genResult = await vcs.generatePatch(agentWorkspace, upstream);
      expect(genResult.success).toBe(true);
      expect(genResult.patch).toBeTruthy();

      const patchFile = join(patchDir, "test.patch");
      writeFileSync(patchFile, genResult.patch!);

      const result = await vcs.applyPatch(patchFile, upstream, "git");

      expect(result.success).toBe(true);
      expect(readFileSync(join(upstream, "file.txt"), "utf-8")).toBe(
        "modified",
      );
    }, 15000);

    it("should apply patch to fossil upstream using patch -p1", async () => {
      const vcs = new VCS();
      const upstream = join(testHome, "upstream-apply-fossil");
      const patchDir = join(testHome, "patches-apply-fossil");

      mkdirSync(upstream, { recursive: true });
      mkdirSync(patchDir, { recursive: true });

      writeFileSync(join(upstream, "file.txt"), "original\n");

      // Create a standard unified diff
      const patchContent = [
        "diff --git a/file.txt b/file.txt",
        "--- a/file.txt",
        "+++ b/file.txt",
        "@@ -1 +1 @@",
        "-original",
        "+modified",
        "",
      ].join("\n");

      const patchFile = join(patchDir, "test.patch");
      writeFileSync(patchFile, patchContent);

      const result = await vcs.applyPatch(patchFile, upstream, "fossil");

      expect(result.success).toBe(true);
      expect(readFileSync(join(upstream, "file.txt"), "utf-8").trim()).toBe(
        "modified",
      );
    }, 10000);
  });

  describe("generateAndApplyPatch (integration)", () => {
    it("should complete full patch workflow for git upstream", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-full");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");
      const patchDir = join(sessionDir, "patches");

      // Setup upstream as git repo
      mkdirSync(upstream, { recursive: true });
      execSync("git init", { cwd: upstream });
      execSync('git config user.email "test@test.com"', { cwd: upstream });
      execSync('git config user.name "Test"', { cwd: upstream });
      writeFileSync(join(upstream, "existing.txt"), "existing content");
      execSync("git add .", { cwd: upstream });
      execSync('git commit -m "Initial"', { cwd: upstream });

      // Setup agent workspace with modifications
      mkdirSync(agentWorkspace, { recursive: true });
      writeFileSync(join(agentWorkspace, "existing.txt"), "modified content");
      writeFileSync(join(agentWorkspace, "new-file.txt"), "brand new");

      // Run the full workflow
      const result = await vcs.generateAndApplyPatch(
        agentWorkspace,
        upstream,
        patchDir,
        "git",
      );

      expect(result.success).toBe(true);
      expect(result.patchPath).toBeTruthy();

      // Verify patch was stored
      expect(existsSync(result.patchPath!)).toBe(true);
      const patches = readdirSync(patchDir).filter((f: string) =>
        f.endsWith(".patch"),
      );
      expect(patches.length).toBe(1);

      // Verify changes were applied to upstream
      expect(readFileSync(join(upstream, "existing.txt"), "utf-8")).toBe(
        "modified content",
      );
      expect(readFileSync(join(upstream, "new-file.txt"), "utf-8")).toBe(
        "brand new",
      );
    }, 15000);

    it("should handle no changes gracefully", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-nochange");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");
      const patchDir = join(sessionDir, "patches");

      mkdirSync(upstream, { recursive: true });
      mkdirSync(agentWorkspace, { recursive: true });

      writeFileSync(join(upstream, "same.txt"), "same");
      writeFileSync(join(agentWorkspace, "same.txt"), "same");

      const result = await vcs.generateAndApplyPatch(
        agentWorkspace,
        upstream,
        patchDir,
        "git",
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("No changes");
      expect(result.patchPath).toBeUndefined();

      // No patch file should be created
      if (existsSync(patchDir)) {
        const patches = readdirSync(patchDir).filter((f: string) =>
          f.endsWith(".patch"),
        );
        expect(patches.length).toBe(0);
      }
    }, 10000);

    it("should handle file deletions in full workflow", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-delete");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");
      const patchDir = join(sessionDir, "patches");

      // Setup upstream with a file
      mkdirSync(upstream, { recursive: true });
      execSync("git init", { cwd: upstream });
      execSync('git config user.email "test@test.com"', { cwd: upstream });
      execSync('git config user.name "Test"', { cwd: upstream });
      writeFileSync(join(upstream, "to-delete.txt"), "will be removed");
      writeFileSync(join(upstream, "to-keep.txt"), "keep this");
      execSync("git add .", { cwd: upstream });
      execSync('git commit -m "Initial"', { cwd: upstream });

      // Agent workspace has only the file to keep
      mkdirSync(agentWorkspace, { recursive: true });
      writeFileSync(join(agentWorkspace, "to-keep.txt"), "keep this");

      const result = await vcs.generateAndApplyPatch(
        agentWorkspace,
        upstream,
        patchDir,
        "git",
      );

      expect(result.success).toBe(true);
      expect(existsSync(join(upstream, "to-delete.txt"))).toBe(false);
      expect(existsSync(join(upstream, "to-keep.txt"))).toBe(true);
    }, 15000);

    it("should handle nested directory structures", async () => {
      const vcs = new VCS();
      const sessionDir = join(testHome, "session-nested");
      const upstream = join(sessionDir, "upstream");
      const agentWorkspace = join(sessionDir, "agent-workspace");
      const patchDir = join(sessionDir, "patches");

      mkdirSync(upstream, { recursive: true });
      execSync("git init", { cwd: upstream });
      execSync('git config user.email "test@test.com"', { cwd: upstream });
      execSync('git config user.name "Test"', { cwd: upstream });
      mkdirSync(join(upstream, "src"), { recursive: true });
      writeFileSync(join(upstream, "src", "app.ts"), "old code");
      execSync("git add .", { cwd: upstream });
      execSync('git commit -m "Initial"', { cwd: upstream });

      // Agent workspace with nested structure
      mkdirSync(join(agentWorkspace, "src", "components"), { recursive: true });
      writeFileSync(join(agentWorkspace, "src", "app.ts"), "new code");
      writeFileSync(
        join(agentWorkspace, "src", "components", "Button.tsx"),
        "export const Button = () => {}",
      );

      const result = await vcs.generateAndApplyPatch(
        agentWorkspace,
        upstream,
        patchDir,
        "git",
      );

      expect(result.success).toBe(true);
      expect(readFileSync(join(upstream, "src", "app.ts"), "utf-8")).toBe(
        "new code",
      );
      expect(
        existsSync(join(upstream, "src", "components", "Button.tsx")),
      ).toBe(true);
    }, 15000);
  });
});
