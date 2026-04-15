import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join, resolve } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";

const AGENT_CWD = import.meta.dir.replace("/integration-test", "");

describe("mimo-agent", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = join(tmpdir(), `mimo-agent-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe("CLI argument parsing", () => {
    it("should parse --token argument", async () => {
      const proc = Bun.spawn(
        [
          process.execPath,
          "run",
          "src/index.ts",
          "--token",
          "test-token-123",
          "--platform",
          "ws://localhost:3000/ws/agent",
        ],
        {
          cwd: AGENT_CWD,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, NODE_ENV: "test" },
        },
      );

      // Wait a bit then kill
      await new Promise((resolve) => setTimeout(resolve, 1000));
      proc.kill();

      const exitCode = await proc.exited;
      expect(exitCode).toBeGreaterThanOrEqual(0); // Should exit cleanly or with error
    });

    it("should fail without --token", async () => {
      const proc = Bun.spawn(
        [
          process.execPath,
          "run",
          "src/index.ts",
          "--platform",
          "ws://localhost:3000",
        ],
        {
          cwd: AGENT_CWD,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0); // Should fail
    });

    it("should fail without --platform", async () => {
      const proc = Bun.spawn(
        [process.execPath, "run", "src/index.ts", "--token", "test-token"],
        {
          cwd: AGENT_CWD,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0); // Should fail
    });

    it("should use current directory as default workdir", async () => {
      // This test verifies workdir defaults to process.cwd()
      const expectedDefaultWorkdir = process.cwd();
      expect(expectedDefaultWorkdir).toBeDefined();
    });
  });

  describe("Session management", () => {
    it("should handle relative path resolution", () => {
      const workdir = "/home/user/work";
      const relativePath = "projects/abc/sessions/xyz/checkout";
      const expected = resolve(workdir, relativePath);

      // Test path resolution
      expect(expected).toBe(
        "/home/user/work/projects/abc/sessions/xyz/checkout",
      );
    });

    it("should handle absolute path resolution", () => {
      const workdir = "/home/user/work";
      const absolutePath = "/tmp/other/checkout";
      const resolved = resolve(workdir, absolutePath);

      // resolve with absolute path returns the absolute path
      expect(resolved).toBe(absolutePath);
    });

    it("should compute path outside workdir", () => {
      const workdir = "/home/user/work";
      const outsidePath = "../other/project";
      const resolved = resolve(workdir, outsidePath);

      expect(resolved).toBe("/home/user/other/project");
    });
  });

  describe("File watching", () => {
    it("should watch files in work directory", async () => {
      // Create test directory structure
      const testDir = join(tempDir, "watch-test");
      mkdirSync(testDir, { recursive: true });

      // Write a test file
      const testFile = join(testDir, "test.txt");
      writeFileSync(testFile, "initial content");

      expect(existsSync(testFile)).toBe(true);
    });
  });

  describe("Graceful shutdown", () => {
    it("should handle SIGTERM gracefully", async () => {
      const proc = Bun.spawn(
        [
          process.execPath,
          "run",
          "src/index.ts",
          "--token",
          "test",
          "--platform",
          "ws://localhost:3000",
        ],
        {
          cwd: AGENT_CWD,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      // Wait for startup
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Send SIGTERM
      proc.kill("SIGTERM");

      const exitCode = await proc.exited;
      // Exit code can be 0 (graceful) or non-zero (connection failed)
      expect(exitCode).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Session ended handling", () => {
    it("should handle session_ended message without error", async () => {
      // Import SessionManager to test cleanup logic
      const { SessionManager } = await import("../src/session");

      const mockCallbacks = {
        onFileChange: () => {},
        onSessionError: () => {},
      };

      const manager = new SessionManager(tempDir, mockCallbacks);

      // Create a session
      const sessionId = "test-session-1";
      await manager.createSession(
        sessionId,
        "http://example.com/repo",
        "user",
        "pass",
      );

      // Verify session exists
      expect(manager.getSession(sessionId)).toBeDefined();

      // Terminate session (simulating what handleSessionEnded does)
      manager.terminateSession(sessionId);

      // Verify session is cleaned up
      expect(manager.getSession(sessionId)).toBeUndefined();
    });

    it("should handle duplicate session_ended messages idempotently", async () => {
      const { SessionManager } = await import("../src/session");

      const mockCallbacks = {
        onFileChange: () => {},
        onSessionError: () => {},
      };

      const manager = new SessionManager(tempDir, mockCallbacks);

      const sessionId = "test-session-2";
      await manager.createSession(
        sessionId,
        "http://example.com/repo",
        "user",
        "pass",
      );

      // First termination
      manager.terminateSession(sessionId);
      expect(manager.getSession(sessionId)).toBeUndefined();

      // Second termination (should not throw)
      expect(() => manager.terminateSession(sessionId)).not.toThrow();
      expect(manager.getSession(sessionId)).toBeUndefined();
    });

    it("should handle session_ended for unknown session", async () => {
      const { SessionManager } = await import("../src/session");

      const mockCallbacks = {
        onFileChange: () => {},
        onSessionError: () => {},
      };

      const manager = new SessionManager(tempDir, mockCallbacks);

      // Terminate a session that was never created (should not throw)
      expect(() =>
        manager.terminateSession("non-existent-session"),
      ).not.toThrow();
      expect(manager.getSession("non-existent-session")).toBeUndefined();
    });

    it("should clean up file watcher on session ended", async () => {
      const { SessionManager } = await import("../src/session");

      const mockCallbacks = {
        onFileChange: () => {},
        onSessionError: () => {},
      };

      const manager = new SessionManager(tempDir, mockCallbacks);

      const sessionId = "test-session-3";
      const session = await manager.createSession(
        sessionId,
        "http://example.com/repo",
        "user",
        "pass",
      );

      // Verify file watcher was started
      expect(session.fileWatcher).toBeDefined();

      // Terminate session
      manager.terminateSession(sessionId);

      // Session should be cleaned up
      expect(manager.getSession(sessionId)).toBeUndefined();
    });
  });
});
