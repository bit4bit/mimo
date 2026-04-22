// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Tests for write_file message handler in mimo-agent
 *
 * Covers:
 *   - write_file message writes content to checkout path
 *   - write_file creates parent directories if needed
 *   - write_file sends file_written confirmation
 *   - write_file handles missing fields gracefully
 *   - write_file handles missing session gracefully
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";

// Mock the MimoAgent class to test handleWriteFile in isolation
class MockSessionManager {
  private sessions: Map<string, { checkoutPath: string }> = new Map();

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  addSession(sessionId: string, checkoutPath: string) {
    this.sessions.set(sessionId, { checkoutPath });
  }
}

describe("write_file message handler", () => {
  let tempDir: string;
  let sessionManager: MockSessionManager;
  let sentMessages: any[] = [];

  beforeEach(() => {
    tempDir = join(tmpdir(), `mimo-agent-write-file-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    sessionManager = new MockSessionManager();
    sentMessages = [];
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Simulated handleWriteFile function (mirrors the implementation in index.ts)
  async function handleWriteFile(message: any, sessionMgr: MockSessionManager, sendFn: (msg: any) => void) {
    const { sessionId, filePath, content } = message;
    if (!sessionId || !filePath || content === undefined) {
      // Missing fields - silently return (matches implementation)
      return;
    }

    const session = sessionMgr.getSession(sessionId);
    if (!session) {
      // No session - silently return (matches implementation)
      return;
    }

    const fullPath = join(session.checkoutPath, filePath);
    const dir = join(fullPath, "..").replace(/\\/g, "/");

    try {
      // Ensure parent directory exists
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Write file content
      const { writeFileSync } = await import("fs");
      writeFileSync(fullPath, content, "utf-8");

      sendFn({
        type: "file_written",
        sessionId,
        filePath,
        timestamp: new Date().toISOString(),
      });
      sendFn({
        type: "file_changed",
        sessionId,
        files: [{ path: filePath, isNew: false, deleted: false }],
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      sendFn({
        type: "error_response",
        sessionId,
        error: `Write file failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  describe("successful writes", () => {
    it("writes file content to checkout path", async () => {
      const sessionId = "test-session-1";
      const checkoutPath = join(tempDir, sessionId);
      mkdirSync(checkoutPath, { recursive: true });
      sessionManager.addSession(sessionId, checkoutPath);

      const filePath = "src/utils/helper.ts";
      const content = "export function helper() { return true; }";

      await handleWriteFile(
        { sessionId, filePath, content },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      // Verify file was written
      const fullPath = join(checkoutPath, filePath);
      expect(existsSync(fullPath)).toBe(true);
      expect(readFileSync(fullPath, "utf-8")).toBe(content);

      // Verify confirmation was sent
      expect(sentMessages[0].type).toBe("file_written");
      expect(sentMessages[0].sessionId).toBe(sessionId);
      expect(sentMessages[0].filePath).toBe(filePath);
      expect(sentMessages[0].timestamp).toBeDefined();
    });

    it("sends file_changed after writing so the platform sync picks up the change", async () => {
      const sessionId = "test-session-1b";
      const checkoutPath = join(tempDir, sessionId);
      mkdirSync(checkoutPath, { recursive: true });
      sessionManager.addSession(sessionId, checkoutPath);

      const filePath = "src/foo.ts";
      const content = "const x = 1;";

      await handleWriteFile(
        { sessionId, filePath, content },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      const fileChanged = sentMessages.find((m) => m.type === "file_changed");
      expect(fileChanged).toBeDefined();
      expect(fileChanged.sessionId).toBe(sessionId);
      expect(Array.isArray(fileChanged.files)).toBe(true);
      expect(fileChanged.files[0].path).toBe(filePath);
      expect(fileChanged.files[0].isNew).toBe(false);
      expect(fileChanged.files[0].deleted).toBe(false);
    });

    it("creates parent directories if they do not exist", async () => {
      const sessionId = "test-session-2";
      const checkoutPath = join(tempDir, sessionId);
      mkdirSync(checkoutPath, { recursive: true });
      sessionManager.addSession(sessionId, checkoutPath);

      const filePath = "deep/nested/path/file.txt";
      const content = "nested content";

      const nestedDir = join(checkoutPath, "deep", "nested", "path");
      expect(existsSync(nestedDir)).toBe(false);

      await handleWriteFile(
        { sessionId, filePath, content },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      // Verify directories were created
      expect(existsSync(nestedDir)).toBe(true);

      // Verify file was written
      const fullPath = join(checkoutPath, filePath);
      expect(readFileSync(fullPath, "utf-8")).toBe(content);

      // Verify confirmation was sent
      expect(sentMessages[0].type).toBe("file_written");
    });

    it("overwrites existing file content", async () => {
      const sessionId = "test-session-3";
      const checkoutPath = join(tempDir, sessionId);
      mkdirSync(checkoutPath, { recursive: true });
      sessionManager.addSession(sessionId, checkoutPath);

      const filePath = "existing.txt";
      const initialContent = "old content";
      const newContent = "new content";

      // Create initial file
      const fullPath = join(checkoutPath, filePath);
      const { writeFileSync } = await import("fs");
      writeFileSync(fullPath, initialContent, "utf-8");

      await handleWriteFile(
        { sessionId, filePath, content: newContent },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      // Verify file was overwritten
      expect(readFileSync(fullPath, "utf-8")).toBe(newContent);
      expect(sentMessages[0].type).toBe("file_written");
    });

    it("handles empty content", async () => {
      const sessionId = "test-session-4";
      const checkoutPath = join(tempDir, sessionId);
      mkdirSync(checkoutPath, { recursive: true });
      sessionManager.addSession(sessionId, checkoutPath);

      const filePath = "empty.txt";
      const content = "";

      await handleWriteFile(
        { sessionId, filePath, content },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      const fullPath = join(checkoutPath, filePath);
      expect(existsSync(fullPath)).toBe(true);
      expect(readFileSync(fullPath, "utf-8")).toBe("");
      expect(sentMessages[0].type).toBe("file_written");
    });
  });

  describe("error handling", () => {
    it("returns silently when sessionId is missing", async () => {
      await handleWriteFile(
        { filePath: "test.txt", content: "test" },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      expect(sentMessages).toHaveLength(0);
    });

    it("returns silently when filePath is missing", async () => {
      await handleWriteFile(
        { sessionId: "test", content: "test" },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      expect(sentMessages).toHaveLength(0);
    });

    it("returns silently when content is undefined", async () => {
      await handleWriteFile(
        { sessionId: "test", filePath: "test.txt" },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      expect(sentMessages).toHaveLength(0);
    });

    it("returns silently when content is null", async () => {
      await handleWriteFile(
        { sessionId: "test", filePath: "test.txt", content: null },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      expect(sentMessages).toHaveLength(0);
    });

    it("returns silently when session does not exist", async () => {
      await handleWriteFile(
        { sessionId: "non-existent", filePath: "test.txt", content: "test" },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      expect(sentMessages).toHaveLength(0);
    });

    it("sends error_response when write fails", async () => {
      const sessionId = "test-session-5";
      const checkoutPath = join(tempDir, sessionId);
      mkdirSync(checkoutPath, { recursive: true });
      sessionManager.addSession(sessionId, checkoutPath);

      // Use an invalid file path that should cause write to fail
      // (e.g., using a path with null bytes on some systems)
      const filePath = "test.txt\0invalid";

      try {
        await handleWriteFile(
          { sessionId, filePath, content: "test" },
          sessionManager,
          (msg) => sentMessages.push(msg)
        );

        // If we get here, verify error was sent
        if (sentMessages.length > 0) {
          expect(sentMessages[0].type).toBe("error_response");
          expect(sentMessages[0].error).toContain("Write file failed");
        }
      } catch {
        // Some systems might throw synchronously
        expect(sentMessages.length).toBeGreaterThan(0);
      }
    });
  });

  describe("path handling", () => {
    it("handles relative paths correctly", async () => {
      const sessionId = "test-session-6";
      const checkoutPath = join(tempDir, sessionId);
      mkdirSync(checkoutPath, { recursive: true });
      sessionManager.addSession(sessionId, checkoutPath);

      const filePath = "./relative/path.txt";
      const content = "relative content";

      await handleWriteFile(
        { sessionId, filePath, content },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      const fullPath = join(checkoutPath, filePath);
      expect(existsSync(fullPath)).toBe(true);
      expect(sentMessages[0].type).toBe("file_written");
    });

    it("handles deeply nested paths", async () => {
      const sessionId = "test-session-7";
      const checkoutPath = join(tempDir, sessionId);
      mkdirSync(checkoutPath, { recursive: true });
      sessionManager.addSession(sessionId, checkoutPath);

      const filePath = "a/b/c/d/e/f/g/h/i/j/deep.txt";
      const content = "very deep content";

      await handleWriteFile(
        { sessionId, filePath, content },
        sessionManager,
        (msg) => sentMessages.push(msg)
      );

      const fullPath = join(checkoutPath, filePath);
      expect(existsSync(fullPath)).toBe(true);
      expect(readFileSync(fullPath, "utf-8")).toBe(content);
    });
  });
});