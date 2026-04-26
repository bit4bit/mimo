/**
 * OS Abstraction BDD Test Suite
 *
 * Comprehensive coverage for filesystem operations.
 * Run this before migrating sync fs to async.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { createOS } from "./node-adapter.js";
import { createMockOS, type MockOS } from "./mock-adapter.js";
import type { OS } from "./types.js";

describe("OS FileSystem - BDD Coverage", () => {
  let os: OS;

  beforeEach(() => {
    os = createOS({ ...process.env });
  });

  describe("exists()", () => {
    it("should return true for existing files", () => {
      expect(os.fs.exists("/tmp")).toBe(true);
    });

    it("should return false for non-existent files", () => {
      expect(os.fs.exists("/nonexistent-path-xyz")).toBe(false);
    });
  });

  describe("readFile()", () => {
    it("should read file contents", async () => {
      const tmpFile = `/tmp/os-test-${Date.now()}.txt`;
      os.fs.writeFile(tmpFile, "hello world");

      const content = os.fs.readFile(tmpFile);
      expect(content).toBe("hello world");

      os.fs.unlink(tmpFile);
    });

    it("should throw for non-existent files", () => {
      expect(() => os.fs.readFile("/nonexistent")).toThrow();
    });
  });

  describe("writeFile()", () => {
    it("should create new files", () => {
      const tmpFile = `/tmp/os-write-test-${Date.now()}.txt`;
      os.fs.writeFile(tmpFile, "test content");
      expect(os.fs.exists(tmpFile)).toBe(true);
      os.fs.unlink(tmpFile);
    });

    it("should overwrite existing files", () => {
      const tmpFile = `/tmp/os-overwrite-${Date.now()}.txt`;
      os.fs.writeFile(tmpFile, "first");
      os.fs.writeFile(tmpFile, "second");
      expect(os.fs.readFile(tmpFile)).toBe("second");
      os.fs.unlink(tmpFile);
    });
  });

  describe("mkdir()", () => {
    it("should create directories", () => {
      const tmpDir = `/tmp/os-mkdir-${Date.now()}`;
      os.fs.mkdir(tmpDir);
      expect(os.fs.exists(tmpDir)).toBe(true);
      os.fs.rm(tmpDir, { recursive: true });
    });

    it("should create nested directories with recursive option", () => {
      const tmpDir = `/tmp/os-mkdir-nested-${Date.now()}/a/b/c`;
      os.fs.mkdir(tmpDir, { recursive: true });
      expect(os.fs.exists(tmpDir)).toBe(true);
      os.fs.rm(`/tmp/os-mkdir-nested-${Date.now()}`, { recursive: true });
    });
  });

  describe("unlink()", () => {
    it("should delete files", () => {
      const tmpFile = `/tmp/os-unlink-${Date.now()}.txt`;
      os.fs.writeFile(tmpFile, "to delete");
      expect(os.fs.exists(tmpFile)).toBe(true);
      os.fs.unlink(tmpFile);
      expect(os.fs.exists(tmpFile)).toBe(false);
    });
  });

  describe("copyFile()", () => {
    it("should copy files", () => {
      const src = `/tmp/os-copy-src-${Date.now()}.txt`;
      const dest = `/tmp/os-copy-dest-${Date.now()}.txt`;
      os.fs.writeFile(src, "original content");
      os.fs.copyFile(src, dest);
      expect(os.fs.readFile(dest)).toBe("original content");
      os.fs.unlink(src);
      os.fs.unlink(dest);
    });
  });

  describe("chmod()", () => {
    it("should change file permissions", () => {
      const tmpFile = `/tmp/os-chmod-${Date.now()}.txt`;
      os.fs.writeFile(tmpFile, "content");
      os.fs.chmod(tmpFile, 0o755);
      const stats = os.fs.stat(tmpFile);
      expect(stats.isFile()).toBe(true);
      os.fs.unlink(tmpFile);
    });
  });

  describe("rename()", () => {
    it("should rename files", () => {
      const oldPath = `/tmp/os-rename-old-${Date.now()}.txt`;
      const newPath = `/tmp/os-rename-new-${Date.now()}.txt`;
      os.fs.writeFile(oldPath, "content");
      os.fs.rename(oldPath, newPath);
      expect(os.fs.exists(oldPath)).toBe(false);
      expect(os.fs.exists(newPath)).toBe(true);
      os.fs.unlink(newPath);
    });
  });

  describe("rm()", () => {
    it("should remove directories recursively", () => {
      const tmpDir = `/tmp/os-rm-${Date.now()}`;
      os.fs.mkdir(tmpDir, { recursive: true });
      os.fs.writeFile(`${tmpDir}/file.txt`, "content");
      os.fs.rm(tmpDir, { recursive: true });
      expect(os.fs.exists(tmpDir)).toBe(false);
    });
  });

  describe("readdir()", () => {
    it("should list directory contents", () => {
      const tmpDir = `/tmp/os-readdir-${Date.now()}`;
      os.fs.mkdir(tmpDir);
      os.fs.writeFile(`${tmpDir}/a.txt`, "a");
      os.fs.writeFile(`${tmpDir}/b.txt`, "b");

      const entries = os.fs.readdir(tmpDir) as string[];
      expect(entries).toContain("a.txt");
      expect(entries).toContain("b.txt");

      os.fs.rm(tmpDir, { recursive: true });
    });
  });

  describe("stat()", () => {
    it("should return file stats", () => {
      const tmpFile = `/tmp/os-stat-${Date.now()}.txt`;
      os.fs.writeFile(tmpFile, "content");

      const stats = os.fs.stat(tmpFile);
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.size).toBeGreaterThan(0);

      os.fs.unlink(tmpFile);
    });
  });

  describe("lstat()", () => {
    it("should return symlink stats", () => {
      const tmpFile = `/tmp/os-lstat-${Date.now()}.txt`;
      os.fs.writeFile(tmpFile, "content");

      const stats = os.fs.lstat(tmpFile);
      expect(stats.isFile()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);

      os.fs.unlink(tmpFile);
    });
  });

  describe("cp()", () => {
    it("should copy directories recursively", () => {
      const srcDir = `/tmp/os-cp-src-${Date.now()}`;
      const destDir = `/tmp/os-cp-dest-${Date.now()}`;

      os.fs.mkdir(srcDir, { recursive: true });
      os.fs.writeFile(`${srcDir}/file.txt`, "content");

      os.fs.cp(srcDir, destDir, { recursive: true });
      expect(os.fs.exists(`${destDir}/file.txt`)).toBe(true);

      os.fs.rm(srcDir, { recursive: true });
      os.fs.rm(destDir, { recursive: true });
    });
  });

  describe("realpath()", () => {
    it("should resolve absolute paths", () => {
      const resolved = os.fs.realpath("/tmp");
      expect(resolved).toBe("/tmp");
    });
  });

  describe("mkdtemp()", () => {
    it("should create temporary directories", () => {
      const tmpDir = os.fs.mkdtemp("/tmp/os-temp-");
      expect(os.fs.exists(tmpDir)).toBe(true);
      expect(tmpDir.startsWith("/tmp/os-temp-")).toBe(true);
      os.fs.rm(tmpDir, { recursive: true });
    });
  });
});

describe("OS CommandRunner - BDD Coverage", () => {
  let os: OS;

  beforeEach(() => {
    os = createOS({ ...process.env });
  });

  describe("run()", () => {
    it("should execute commands asynchronously", async () => {
      const result = await os.command.run(["echo", "hello"]);
      expect(result.success).toBe(true);
      expect(result.output).toBe("hello");
    });

    it("should capture exit codes", async () => {
      const result = await os.command.run(["false"]);
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("should accept timeout option", async () => {
      const result = await os.command.run(["sleep", "0.01"], {
        timeoutMs: 1000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("runSync()", () => {
    it("should execute commands synchronously", () => {
      const result = os.command.runSync(["echo", "sync-test"]);
      expect(result.success).toBe(true);
      expect(result.output).toBe("sync-test");
    });
  });
});

describe("OS Environment - BDD Coverage", () => {
  let os: OS;

  beforeEach(() => {
    os = createOS({
      TEST_VAR: "test-value",
      ANOTHER_VAR: "another-value",
    });
  });

  describe("get()", () => {
    it("should return env values", () => {
      expect(os.env.get("TEST_VAR")).toBe("test-value");
    });

    it("should return undefined for missing vars", () => {
      expect(os.env.get("MISSING")).toBeUndefined();
    });
  });

  describe("getOrThrow()", () => {
    it("should return values for existing vars", () => {
      expect(os.env.getOrThrow("TEST_VAR")).toBe("test-value");
    });

    it("should throw for missing vars", () => {
      expect(() => os.env.getOrThrow("MISSING")).toThrow();
    });
  });

  describe("has()", () => {
    it("should return true for existing vars", () => {
      expect(os.env.has("TEST_VAR")).toBe(true);
    });

    it("should return false for missing vars", () => {
      expect(os.env.has("MISSING")).toBe(false);
    });
  });

  describe("getAll()", () => {
    it("should return all env vars", () => {
      const all = os.env.getAll();
      expect(all.TEST_VAR).toBe("test-value");
      expect(all.ANOTHER_VAR).toBe("another-value");
    });
  });
});

describe("OS PathResolver - BDD Coverage", () => {
  let os: OS;

  beforeEach(() => {
    os = createOS({});
  });

  describe("join()", () => {
    it("should join path segments", () => {
      expect(os.path.join("/a", "b", "c")).toBe("/a/b/c");
    });
  });

  describe("dirname()", () => {
    it("should return directory path", () => {
      expect(os.path.dirname("/a/b/c.txt")).toBe("/a/b");
    });
  });

  describe("basename()", () => {
    it("should return file name", () => {
      expect(os.path.basename("/a/b/c.txt")).toBe("c.txt");
    });
  });

  describe("relative()", () => {
    it("should compute relative paths", () => {
      expect(os.path.relative("/a/b", "/a/b/c")).toBe("c");
    });
  });

  describe("resolve()", () => {
    it("should resolve absolute paths", () => {
      expect(os.path.resolve("/a", "b", "c")).toBe("/a/b/c");
    });
  });

  describe("homeDir()", () => {
    it("should return home directory", () => {
      expect(typeof os.path.homeDir()).toBe("string");
      expect(os.path.homeDir().length).toBeGreaterThan(0);
    });
  });

  describe("tempDir()", () => {
    it("should return temp directory", () => {
      expect(typeof os.path.tempDir()).toBe("string");
      expect(os.path.tempDir().length).toBeGreaterThan(0);
    });
  });
});

describe("MockOS - BDD Coverage", () => {
  describe("MockFileSystem", () => {
    it("should seed files", () => {
      const os = createMockOS() as MockOS;
      os.fs.seed({
        "/test/file.txt": "content",
        "/test/dir": null,
      });
      expect(os.fs.exists("/test/file.txt")).toBe(true);
      expect(os.fs.readFile("/test/file.txt")).toBe("content");
    });
  });

  describe("MockCommandRunner", () => {
    it("should register command handlers", async () => {
      const os = createMockOS() as MockOS;
      os.command.onCommand("git", (args) => ({
        success: true,
        output: `git ${args.join(" ")}`,
        error: "",
        exitCode: 0,
      }));

      const result = await os.command.run(["git", "status"]);
      expect(result.output).toBe("git status");
    });
  });

  describe("MockEnvironment", () => {
    it("should use injected env", () => {
      const os = createMockOS({
        env: { CUSTOM: "value" },
      }) as MockOS;
      expect(os.env.get("CUSTOM")).toBe("value");
    });
  });

  describe("MockPathResolver", () => {
    it("should use injected paths", () => {
      const os = createMockOS({
        homeDir: "/home/mock",
        tempDir: "/tmp/mock",
      }) as MockOS;
      expect(os.path.homeDir()).toBe("/home/mock");
      expect(os.path.tempDir()).toBe("/tmp/mock");
    });
  });
});
