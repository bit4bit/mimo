/**
 * Agent Filesystem Behavior Tests
 *
 * BDD-style tests documenting filesystem behaviors from index.ts perspective.
 * These behaviors must be preserved when migrating sync → async.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createOS } from "../src/os/node-adapter.js";
import type { OS } from "../src/os/types.js";

describe("Agent Filesystem Behaviors", () => {
  let os: OS;
  let testDir: string;

  beforeEach(async () => {
    os = createOS({ ...process.env });
    testDir = await os.fs.mkdtemp("/tmp/agent-test-");
  });

  afterEach(async () => {
    try {
      await os.fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe("Workspace Initialization", () => {
    it("should create workDir if it does not exist (B1)", async () => {
      const workDir = `${testDir}/workspace`;

      if (!await os.fs.exists(workDir)) {
        await os.fs.mkdir(workDir, { recursive: true });
      }

      expect(await os.fs.exists(workDir)).toBe(true);
      expect((await os.fs.stat(workDir)).isDirectory()).toBe(true);
    });

    it("should not fail if workDir already exists (B2)", async () => {
      const workDir = `${testDir}/workspace`;
      await os.fs.mkdir(workDir);

      if (!await os.fs.exists(workDir)) {
        await os.fs.mkdir(workDir, { recursive: true });
      }

      expect(await os.fs.exists(workDir)).toBe(true);
    });
  });

  describe("Fossil Repository Setup", () => {
    it("should check if repoPath exists before opening (B3)", async () => {
      const sessionId = "test-session";
      const checkoutPath = `${testDir}/checkout`;
      const repoPath = `${checkoutPath}/../${sessionId}.fossil`;

      const repoExists = await os.fs.exists(repoPath);
      expect(repoExists).toBe(false);

      await os.fs.mkdir(checkoutPath, { recursive: true });
      await os.fs.writeFile(repoPath, "fossil-data");

      const repoExistsAfter = await os.fs.exists(repoPath);
      expect(repoExistsAfter).toBe(true);
    });

    it("should create checkoutPath if missing when repo exists (B4)", async () => {
      const checkoutPath = `${testDir}/checkout`;

      if (!await os.fs.exists(checkoutPath)) {
        await os.fs.mkdir(checkoutPath, { recursive: true });
      }

      expect(await os.fs.exists(checkoutPath)).toBe(true);
    });

    it("should detect existing .fossil directory in checkout (B5)", async () => {
      const checkoutPath = `${testDir}/checkout`;
      await os.fs.mkdir(checkoutPath, { recursive: true });
      await os.fs.mkdir(`${checkoutPath}/.fossil`);

      const hasFossilDir = await os.fs.exists(os.path.join(checkoutPath, ".fossil"));
      expect(hasFossilDir).toBe(true);
    });
  });

  describe("Expert File Operations", () => {
    it("should verify source file exists before copying (B6)", async () => {
      const srcPath = `${testDir}/source.txt`;
      const dstPath = `${testDir}/dest.txt`;

      expect(await os.fs.exists(srcPath)).toBe(false);

      await os.fs.writeFile(srcPath, "content");
      expect(await os.fs.exists(srcPath)).toBe(true);

      await os.fs.copyFile(srcPath, dstPath);
      expect(await os.fs.exists(dstPath)).toBe(true);
      expect(await os.fs.readFile(dstPath)).toBe("content");
    });

    it("should move file from source to destination (B7)", async () => {
      const srcPath = `${testDir}/temp/source.txt`;
      const dstPath = `${testDir}/final/dest.txt`;

      await os.fs.mkdir(`${testDir}/temp`, { recursive: true });
      await os.fs.mkdir(`${testDir}/final`, { recursive: true });
      await os.fs.writeFile(srcPath, "content");

      if (await os.fs.exists(srcPath)) {
        await os.fs.copyFile(srcPath, dstPath);
        await os.fs.unlink(srcPath);
      }

      expect(await os.fs.exists(dstPath)).toBe(true);
      expect(await os.fs.exists(srcPath)).toBe(false);
      expect(await os.fs.readFile(dstPath)).toBe("content");
    });

    it("should clean up temporary files (B8)", async () => {
      const tmpPath = `${testDir}/temp.txt`;
      await os.fs.writeFile(tmpPath, "temp-data");

      if (await os.fs.exists(tmpPath)) {
        await os.fs.unlink(tmpPath);
      }

      expect(await os.fs.exists(tmpPath)).toBe(false);
    });

    it("should read file content for expert fetch (B9)", async () => {
      const tmpPath = `${testDir}/temp.txt`;
      await os.fs.writeFile(tmpPath, "file-content", { encoding: "utf-8" });

      expect(await os.fs.exists(tmpPath)).toBe(true);
      const content = await os.fs.readFile(tmpPath, "utf-8");

      expect(content).toBe("file-content");
    });

    it("should write file with parent directory creation (B10)", async () => {
      const deepPath = `${testDir}/a/b/c/deep.txt`;
      const content = "deep-content";

      const dir = os.path.dirname(deepPath);
      if (!await os.fs.exists(dir)) {
        await os.fs.mkdir(dir, { recursive: true });
      }
      await os.fs.writeFile(deepPath, content, { encoding: "utf-8" });

      expect(await os.fs.exists(deepPath)).toBe(true);
      expect(await os.fs.readFile(deepPath, "utf-8")).toBe(content);
    });
  });

  describe("Path Resolution", () => {
    it("should resolve relative paths from checkout (B11)", async () => {
      const checkoutPath = `${testDir}/checkout`;
      await os.fs.mkdir(checkoutPath, { recursive: true });

      const sessionId = "session-123";
      const repoPath = os.path.join(checkoutPath, "..", `${sessionId}.fossil`);

      const normalized = os.path.resolve(repoPath);
      expect(normalized).toContain(sessionId);
      expect(normalized).toContain(".fossil");
    });

    it("should handle join for nested paths (B12)", () => {
      const base = testDir;
      const nested = os.path.join(base, "src", "components", "Button.tsx");

      expect(nested).toBe(`${base}/src/components/Button.tsx`);
    });
  });

  describe("Error Handling Behaviors", () => {
    it("should handle missing source gracefully (B13)", async () => {
      const missingPath = `${testDir}/missing.txt`;
      const dstPath = `${testDir}/dest.txt`;

      if (await os.fs.exists(missingPath)) {
        await os.fs.copyFile(missingPath, dstPath);
      }

      expect(await os.fs.exists(dstPath)).toBe(false);
    });

    it("should detect file vs directory (B14)", async () => {
      const filePath = `${testDir}/file.txt`;
      const dirPath = `${testDir}/dir`;

      await os.fs.writeFile(filePath, "content");
      await os.fs.mkdir(dirPath);

      expect((await os.fs.stat(filePath)).isFile()).toBe(true);
      expect((await os.fs.stat(filePath)).isDirectory()).toBe(false);
      expect((await os.fs.stat(dirPath)).isDirectory()).toBe(true);
      expect((await os.fs.stat(dirPath)).isFile()).toBe(false);
    });
  });

  describe("Session Checkout Behaviors", () => {
    it("should create missing checkout dir during clone (B15)", async () => {
      const checkoutPath = `${testDir}/new-checkout`;

      if (!await os.fs.exists(checkoutPath)) {
        await os.fs.mkdir(checkoutPath, { recursive: true });
      }

      expect(await os.fs.exists(checkoutPath)).toBe(true);
    });
  });
});

  describe("Async Migration Contract", () => {
    let os: OS;

    beforeEach(() => {
      os = createOS({ ...process.env });
    });

    describe("Contract C1: Idempotent Directory Creation", () => {
      it("mkdir recursive should not fail if dir exists", async () => {
        const dir = `/tmp/async-contract-${Date.now()}`;

        await os.fs.mkdir(dir, { recursive: true });

        expect(() => os.fs.mkdir(dir, { recursive: true })).not.toThrow();

        await os.fs.rm(dir, { recursive: true });
      });
    });

    describe("Contract C2: Atomic Move Operation", () => {
      it("copy+unlink should be treated as atomic move", async () => {
        const src = `/tmp/atomic-src-${Date.now()}.txt`;
        const dst = `/tmp/atomic-dst-${Date.now()}.txt`;

        await os.fs.writeFile(src, "move-me");

        await os.fs.copyFile(src, dst);
        await os.fs.unlink(src);

        expect(await os.fs.exists(dst)).toBe(true);
        expect(await os.fs.exists(src)).toBe(false);
        expect(await os.fs.readFile(dst)).toBe("move-me");
      });
    });

    describe("Contract C3: Path Existence Check", () => {
      it("exists should return boolean, not throw", async () => {
        const existing = `/tmp`;
        const nonExisting = `/tmp/this-does-not-exist-${Date.now()}`;

        expect(() => os.fs.exists(existing)).not.toThrow();
        expect(() => os.fs.exists(nonExisting)).not.toThrow();

        expect(await os.fs.exists(existing)).toBe(true);
        expect(await os.fs.exists(nonExisting)).toBe(false);
      });
    });

    describe("Contract C4: Directory Recursive Deletion", () => {
      it("rm recursive should delete nested files and dirs", async () => {
        const base = `/tmp/rm-recursive-${Date.now()}`;
        await os.fs.mkdir(base, { recursive: true });
        await os.fs.writeFile(`${base}/a.txt`, "a");
        await os.fs.mkdir(`${base}/subdir`);
        await os.fs.writeFile(`${base}/subdir/b.txt`, "b");

        await os.fs.rm(base, { recursive: true });

        expect(await os.fs.exists(base)).toBe(false);
      });
    });

    describe("Contract C5: File Content Integrity", () => {
      it("readFile after writeFile should return original content", async () => {
        const path = `/tmp/content-${Date.now()}.txt`;
        const content = "Hello, World!\nLine 2\n";

        await os.fs.writeFile(path, content);
        const read = await os.fs.readFile(path);

        expect(read).toBe(content);
        await os.fs.unlink(path);
      });
});
});
