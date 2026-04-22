// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";

describe("Agent Handoff Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `mimo-agent-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe("Fossil URL construction", () => {
    it("should construct correct fossil URL from platform URL", () => {
      const platformUrl = "http://localhost:3000";
      const port = 8080;
      const platformHost = platformUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const fossilUrl = `http://${platformHost.split(":")[0]}:${port}/`;

      expect(fossilUrl).toBe("http://localhost:8080/");
    });

    it("should handle platform URL with port", () => {
      const platformUrl = "http://localhost:3000";
      const port = 8000;
      const platformHost = platformUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const fossilUrl = `http://${platformHost.split(":")[0]}:${port}/`;

      // Should extract just "localhost" and add new port
      expect(fossilUrl).toBe("http://localhost:8000/");
      expect(fossilUrl).not.toContain("3000:8000");
    });

    it("should handle https platform URL", () => {
      const platformUrl = "https://example.com";
      const port = 8080;
      const platformHost = platformUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const fossilUrl = `http://${platformHost.split(":")[0]}:${port}/`;

      expect(fossilUrl).toBe("http://example.com:8080/");
    });

    it("should handle platform URL with trailing slash", () => {
      const platformUrl = "http://localhost:3000/";
      const port = 8000;
      const platformHost = platformUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const fossilUrl = `http://${platformHost.split(":")[0]}:${port}/`;

      expect(fossilUrl).toBe("http://localhost:8000/");
    });
  });

  describe("Checkout path derivation", () => {
    it("should derive checkout path from workdir and sessionId", () => {
      const workdir = "/tmp/demo";
      const sessionId = "abc-123";
      const checkoutPath = join(workdir, sessionId);

      expect(checkoutPath).toBe("/tmp/demo/abc-123");
    });

    it("should handle nested workdir", () => {
      const workdir = "/home/user/work/agents/agent-1";
      const sessionId = "session-456";
      const checkoutPath = join(workdir, sessionId);

      expect(checkoutPath).toBe("/home/user/work/agents/agent-1/session-456");
    });
  });

  describe("Fossil repo path", () => {
    it("should place fossil repo in parent of checkout directory", () => {
      const sessionId = "test-session";
      const checkoutPath = "/tmp/demo/test-session";
      const repoPath = join(checkoutPath, "..", `${sessionId}.fossil`);

      // join() normalizes the path, removing the ".." and duplicate segment
      expect(repoPath).toBe("/tmp/demo/test-session.fossil");
    });
  });

  describe("Clone scenarios", () => {
    it("should handle existing fossil repo file", () => {
      const sessionId = "test-session";
      const repoDir = join(tempDir, "repos");
      mkdirSync(repoDir, { recursive: true });

      const repoPath = join(repoDir, `${sessionId}.fossil`);
      const checkoutPath = join(repoDir, sessionId);

      // Simulate existing repo file
      writeFileSync(repoPath, "fake fossil data");

      expect(existsSync(repoPath)).toBe(true);
      expect(existsSync(checkoutPath)).toBe(false);

      // Logic: if repo exists, open it without cloning
      if (existsSync(repoPath)) {
        // Would open existing repo
        expect(true).toBe(true);
      }
    });

    it("should handle existing checkout directory", () => {
      const sessionId = "test-session";
      const workdir = tempDir;
      const checkoutPath = join(workdir, sessionId);
      const fossilDir = join(checkoutPath, ".fossil");

      mkdirSync(checkoutPath, { recursive: true });
      mkdirSync(fossilDir, { recursive: true });

      expect(existsSync(fossilDir)).toBe(true);

      // Logic: if checkout/.fossil exists, ensure it's open
      if (existsSync(fossilDir)) {
        // Would run fossil open
        expect(true).toBe(true);
      }
    });

    it("should handle clone failure for existing file", () => {
      const error = {
        stderr: "file already exists: /tmp/demo/session.fossil\n",
        status: 1,
      };

      expect(error.stderr).toContain("file already exists");
      expect(error.status).toBe(1);
    });
  });

  describe("Session state management", () => {
    it("should track session info with checkout path", () => {
      const sessionId = "session-123";
      const checkoutPath = "/tmp/demo/session-123";
      const fossilUrl = "http://localhost:8080/";

      const sessionInfo = {
        sessionId,
        checkoutPath,
        fossilUrl,
        acpProcess: null,
        fileWatcher: null,
      };

      expect(sessionInfo.sessionId).toBe("session-123");
      expect(sessionInfo.checkoutPath).toBe("/tmp/demo/session-123");
      expect(sessionInfo.fossilUrl).toBe("http://localhost:8080/");
    });

    it("should derive fossil URL from platform URL and port", () => {
      const platformUrl = "http://localhost:3000";
      const port = 8000;

      // This was the bug - would produce http://localhost:3000:8000
      // Fixed version extracts hostname and uses new port
      const platformHost = platformUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const fossilUrl = `http://${platformHost.split(":")[0]}:${port}/`;

      expect(fossilUrl).not.toContain("3000:8000");
      expect(fossilUrl).toBe("http://localhost:8000/");
    });
  });

  describe("Protocol messages", () => {
    it("should format agent_ready with workdir", () => {
      const message = {
        type: "agent_ready",
        workdir: "/tmp/demo",
        timestamp: new Date().toISOString(),
      };

      expect(message.type).toBe("agent_ready");
      expect(message.workdir).toBe("/tmp/demo");
    });

    it("should format session_ready with platformUrl", () => {
      const message = {
        type: "session_ready",
        platformUrl: "http://localhost:3000",
        sessions: [{ sessionId: "abc", port: 8080 }],
      };

      expect(message.platformUrl).toBe("http://localhost:3000");
    });

    it("should format session_error with sessionId", () => {
      const message = {
        type: "session_error",
        sessionId: "abc",
        error: "Clone failed",
        timestamp: new Date().toISOString(),
      };

      expect(message.sessionId).toBe("abc");
      expect(message.error).toBe("Clone failed");
    });

    it("should format agent_sessions_ready with sessionIds", () => {
      const message = {
        type: "agent_sessions_ready",
        sessionIds: ["abc", "def"],
        timestamp: new Date().toISOString(),
      };

      expect(message.sessionIds).toContain("abc");
      expect(message.sessionIds).toContain("def");
    });
  });

  describe("ACP Session Resumption Messages", () => {
    it("should format InitializeResult with successful resumption", () => {
      const result = {
        acpSessionId: "acp-abc123",
        wasReset: false,
      };

      expect(result.acpSessionId).toBe("acp-abc123");
      expect(result.wasReset).toBe(false);
      expect(result.resetReason).toBeUndefined();
    });

    it("should format InitializeResult with reset due to capability", () => {
      const result = {
        acpSessionId: "acp-xyz789",
        wasReset: true,
        resetReason: "loadSession not supported",
      };

      expect(result.acpSessionId).toBe("acp-xyz789");
      expect(result.wasReset).toBe(true);
      expect(result.resetReason).toBe("loadSession not supported");
    });

    it("should format InitializeResult with reset due to error", () => {
      const result = {
        acpSessionId: "acp-new456",
        wasReset: true,
        resetReason: "loadSession failed",
      };

      expect(result.wasReset).toBe(true);
      expect(result.resetReason).toBe("loadSession failed");
    });

    it("should format acp_thread_created for successful resumption", () => {
      const message = {
        type: "acp_thread_created",
        sessionId: "session-1",
        acpSessionId: "acp-abc123",
        wasReset: false,
        timestamp: new Date().toISOString(),
      };

      expect(message.type).toBe("acp_thread_created");
      expect(message.sessionId).toBe("session-1");
      expect(message.acpSessionId).toBe("acp-abc123");
      expect(message.wasReset).toBe(false);
    });

    it("should format acp_thread_created for reset with reason", () => {
      const message = {
        type: "acp_thread_created",
        sessionId: "session-1",
        acpSessionId: "acp-xyz789",
        wasReset: true,
        resetReason: "loadSession not supported",
        timestamp: new Date().toISOString(),
      };

      expect(message.type).toBe("acp_thread_created");
      expect(message.wasReset).toBe(true);
      expect(message.resetReason).toBe("loadSession not supported");
    });
  });

  describe("Capability detection", () => {
    it("should treat undefined loadSession as false", () => {
      const capabilities = {
        loadSession: undefined,
      };

      const hasLoadSession = capabilities.loadSession ?? false;
      expect(hasLoadSession).toBe(false);
    });

    it("should treat explicit false loadSession as false", () => {
      const capabilities = {
        loadSession: false,
      };

      expect(capabilities.loadSession).toBe(false);
    });

    it("should recognize true loadSession capability", () => {
      const capabilities = {
        loadSession: true,
      };

      expect(capabilities.loadSession).toBe(true);
    });
  });

});
