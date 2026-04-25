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

  beforeEach(() => {
    os = createOS({ ...process.env });
    testDir = os.fs.mkdtemp("/tmp/agent-test-");
  });

  afterEach(() => {
    try {
      os.fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe("Workspace Initialization", () => {
    it("should create workDir if it does not exist (B1)", () => {
      const workDir = `${testDir}/workspace`;
      
      // Behavior from index.ts:168-169
      if (!os.fs.exists(workDir)) {
        os.fs.mkdir(workDir, { recursive: true });
      }
      
      expect(os.fs.exists(workDir)).toBe(true);
      expect(os.fs.stat(workDir).isDirectory()).toBe(true);
    });

    it("should not fail if workDir already exists (B2)", () => {
      const workDir = `${testDir}/workspace`;
      os.fs.mkdir(workDir);
      
      // Should be idempotent
      if (!os.fs.exists(workDir)) {
        os.fs.mkdir(workDir, { recursive: true });
      }
      
      expect(os.fs.exists(workDir)).toBe(true);
    });
  });

  describe("Fossil Repository Setup", () => {
    it("should check if repoPath exists before opening (B3)", () => {
      const sessionId = "test-session";
      const checkoutPath = `${testDir}/checkout`;
      const repoPath = `${checkoutPath}/../${sessionId}.fossil`;
      
      // Behavior from index.ts:516
      const repoExists = os.fs.exists(repoPath);
      expect(repoExists).toBe(false);
      
      // Create repo
      os.fs.mkdir(checkoutPath, { recursive: true });
      os.fs.writeFile(repoPath, "fossil-data");
      
      const repoExistsAfter = os.fs.exists(repoPath);
      expect(repoExistsAfter).toBe(true);
    });

    it("should create checkoutPath if missing when repo exists (B4)", () => {
      const checkoutPath = `${testDir}/checkout`;
      
      // Behavior from index.ts:518-519
      if (!os.fs.exists(checkoutPath)) {
        os.fs.mkdir(checkoutPath, { recursive: true });
      }
      
      expect(os.fs.exists(checkoutPath)).toBe(true);
    });

    it("should detect existing .fossil directory in checkout (B5)", () => {
      const checkoutPath = `${testDir}/checkout`;
      os.fs.mkdir(checkoutPath, { recursive: true });
      os.fs.mkdir(`${checkoutPath}/.fossil`);
      
      // Behavior from index.ts:579
      const hasFossilDir = os.fs.exists(os.path.join(checkoutPath, ".fossil"));
      expect(hasFossilDir).toBe(true);
    });
  });

  describe("Expert File Operations", () => {
    it("should verify source file exists before copying (B6)", () => {
      const srcPath = `${testDir}/source.txt`;
      const dstPath = `${testDir}/dest.txt`;
      
      // Behavior from index.ts:2097
      expect(os.fs.exists(srcPath)).toBe(false);
      
      // Create and verify
      os.fs.writeFile(srcPath, "content");
      expect(os.fs.exists(srcPath)).toBe(true);
      
      // Copy
      os.fs.copyFile(srcPath, dstPath);
      expect(os.fs.exists(dstPath)).toBe(true);
      expect(os.fs.readFile(dstPath)).toBe("content");
    });

    it("should move file from source to destination (B7)", () => {
      const srcPath = `${testDir}/temp/source.txt`;
      const dstPath = `${testDir}/final/dest.txt`;
      
      // Setup
      os.fs.mkdir(`${testDir}/temp`, { recursive: true });
      os.fs.mkdir(`${testDir}/final`, { recursive: true });
      os.fs.writeFile(srcPath, "content");
      
      // Behavior from index.ts:2138-2140
      if (os.fs.exists(srcPath)) {
        os.fs.copyFile(srcPath, dstPath);
        os.fs.unlink(srcPath);
      }
      
      expect(os.fs.exists(dstPath)).toBe(true);
      expect(os.fs.exists(srcPath)).toBe(false);
      expect(os.fs.readFile(dstPath)).toBe("content");
    });

    it("should clean up temporary files (B8)", () => {
      const tmpPath = `${testDir}/temp.txt`;
      os.fs.writeFile(tmpPath, "temp-data");
      
      // Behavior from index.ts:2160-2161
      if (os.fs.exists(tmpPath)) {
        os.fs.unlink(tmpPath);
      }
      
      expect(os.fs.exists(tmpPath)).toBe(false);
    });

    it("should read file content for expert fetch (B9)", () => {
      const tmpPath = `${testDir}/temp.txt`;
      os.fs.writeFile(tmpPath, "file-content", { encoding: "utf-8" });
      
      // Behavior from index.ts:2179-2191
      expect(os.fs.exists(tmpPath)).toBe(true);
      const content = os.fs.readFile(tmpPath, "utf-8");
      
      expect(content).toBe("file-content");
    });

    it("should write file with parent directory creation (B10)", () => {
      const deepPath = `${testDir}/a/b/c/deep.txt`;
      const content = "deep-content";
      
      // Behavior from index.ts:2230-2235
      const dir = os.path.dirname(deepPath);
      if (!os.fs.exists(dir)) {
        os.fs.mkdir(dir, { recursive: true });
      }
      os.fs.writeFile(deepPath, content, { encoding: "utf-8" });
      
      expect(os.fs.exists(deepPath)).toBe(true);
      expect(os.fs.readFile(deepPath, "utf-8")).toBe(content);
    });
  });

  describe("Path Resolution", () => {
    it("should resolve relative paths from checkout (B11)", () => {
      const checkoutPath = `${testDir}/checkout`;
      os.fs.mkdir(checkoutPath, { recursive: true });
      
      // Behavior from index.ts:514
      const sessionId = "session-123";
      const repoPath = os.path.join(checkoutPath, "..", `${sessionId}.fossil`);
      
      // Normalize to verify
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
    it("should handle missing source gracefully (B13)", () => {
      const missingPath = `${testDir}/missing.txt`;
      const dstPath = `${testDir}/dest.txt`;
      
      // Should not throw, just skip
      if (os.fs.exists(missingPath)) {
        os.fs.copyFile(missingPath, dstPath);
      }
      
      expect(os.fs.exists(dstPath)).toBe(false);
    });

    it("should detect file vs directory (B14)", () => {
      const filePath = `${testDir}/file.txt`;
      const dirPath = `${testDir}/dir`;
      
      os.fs.writeFile(filePath, "content");
      os.fs.mkdir(dirPath);
      
      expect(os.fs.stat(filePath).isFile()).toBe(true);
      expect(os.fs.stat(filePath).isDirectory()).toBe(false);
      expect(os.fs.stat(dirPath).isDirectory()).toBe(true);
      expect(os.fs.stat(dirPath).isFile()).toBe(false);
    });
  });

  describe("Session Checkout Behaviors", () => {
    it("should create missing checkout dir during clone (B15)", () => {
      const checkoutPath = `${testDir}/new-checkout`;
      
      // Behavior from index.ts:650-651
      if (!os.fs.exists(checkoutPath)) {
        os.fs.mkdir(checkoutPath, { recursive: true });
      }
      
      expect(os.fs.exists(checkoutPath)).toBe(true);
    });
  });
});

describe("Async Migration Contract", () => {
  /**
   * These tests define the contract that async fs must maintain.
   * When migrating sync -> async, these behaviors MUST be preserved.
   */
  let os: OS;
  
  beforeEach(() => {
    os = createOS({ ...process.env });
  });

  describe("Contract C1: Idempotent Directory Creation", () => {
    it("mkdir recursive should not fail if dir exists", async () => {
      const dir = `/tmp/async-contract-${Date.now()}`;
      
      // First call
      os.fs.mkdir(dir, { recursive: true });
      
      // Second call - should not fail (simulating async behavior)
      expect(() => os.fs.mkdir(dir, { recursive: true })).not.toThrow();
      
      os.fs.rm(dir, { recursive: true });
    });
  });

  describe("Contract C2: Atomic Move Operation", () => {
    it("copy+unlink should be treated as atomic move", () => {
      const src = `/tmp/atomic-src-${Date.now()}.txt`;
      const dst = `/tmp/atomic-dst-${Date.now()}.txt`;
      
      os.fs.writeFile(src, "move-me");
      
      // Current behavior: copy then unlink
      os.fs.copyFile(src, dst);
      os.fs.unlink(src);
      
      // Contract: dst exists, src does not
      expect(os.fs.exists(dst)).toBe(true);
      expect(os.fs.exists(src)).toBe(false);
      expect(os.fs.readFile(dst)).toBe("move-me");
    });
  });

  describe("Contract C3: Path Existence Check", () => {
    it("exists should return boolean, not throw", () => {
      const existing = `/tmp`;
      const nonExisting = `/tmp/this-does-not-exist-${Date.now()}`;
      
      expect(() => os.fs.exists(existing)).not.toThrow();
      expect(() => os.fs.exists(nonExisting)).not.toThrow();
      
      expect(os.fs.exists(existing)).toBe(true);
      expect(os.fs.exists(nonExisting)).toBe(false);
    });
  });

  describe("Contract C4: Directory Recursive Deletion", () => {
    it("rm recursive should delete nested files and dirs", () => {
      const base = `/tmp/rm-recursive-${Date.now()}`;
      os.fs.mkdir(base, { recursive: true });
      os.fs.writeFile(`${base}/a.txt`, "a");
      os.fs.mkdir(`${base}/subdir`);
      os.fs.writeFile(`${base}/subdir/b.txt`, "b");
      
      os.fs.rm(base, { recursive: true });
      
      expect(os.fs.exists(base)).toBe(false);
    });
  });

  describe("Contract C5: File Content Integrity", () => {
    it("readFile after writeFile should return original content", () => {
      const path = `/tmp/content-${Date.now()}.txt`;
      const content = "Hello, World!\nLine 2\n";
      
      os.fs.writeFile(path, content);
      const read = os.fs.readFile(path);
      
      expect(read).toBe(content);
      os.fs.unlink(path);
    });
  });
});
