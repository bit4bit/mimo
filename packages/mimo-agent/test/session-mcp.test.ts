// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach } from "bun:test";
import { SessionManager } from "../src/session.js";
import type { McpServerConfig } from "../src/types";

describe("SessionManager with MCP Servers", () => {
  let sessionManager: SessionManager;
  const testWorkDir = "/tmp/mimo-agent-test-sessions";

  beforeEach(() => {
    sessionManager = new SessionManager(testWorkDir, {
      onFileChange: () => {},
      onSessionError: () => {},
    });
  });

  describe("setSessionMcpServers", () => {
    it("should store MCP servers in session info", async () => {
      const session = await sessionManager.createSession(
        "test-session",
        "http://example.com/repo",
        "testuser",
        "testpass",
      );

      const mcpServers: McpServerConfig[] = [
        {
          name: "github",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        },
      ];

      sessionManager.setSessionMcpServers(session.sessionId, mcpServers);

      const updatedSession = sessionManager.getSession(session.sessionId);
      expect(updatedSession?.mcpServers).toEqual(mcpServers);
    });

    it("should overwrite existing MCP servers", async () => {
      const session = await sessionManager.createSession(
        "test-session",
        "http://example.com/repo",
      );

      const initialServers: McpServerConfig[] = [
        { name: "old", command: "node", args: ["old.js"] },
      ];
      sessionManager.setSessionMcpServers(session.sessionId, initialServers);

      const newServers: McpServerConfig[] = [
        { name: "new", command: "npx", args: ["new.js"] },
      ];
      sessionManager.setSessionMcpServers(session.sessionId, newServers);

      const updatedSession = sessionManager.getSession(session.sessionId);
      expect(updatedSession?.mcpServers).toEqual(newServers);
    });

    it("should handle empty MCP servers array", async () => {
      const session = await sessionManager.createSession(
        "test-session",
        "http://example.com/repo",
      );

      sessionManager.setSessionMcpServers(session.sessionId, []);

      const updatedSession = sessionManager.getSession(session.sessionId);
      expect(updatedSession?.mcpServers).toEqual([]);
    });

    it("should do nothing for non-existent session", async () => {
      const mcpServers: McpServerConfig[] = [
        { name: "test", command: "node", args: [] },
      ];

      // Should not throw
      expect(() => {
        sessionManager.setSessionMcpServers("nonexistent", mcpServers);
      }).not.toThrow();
    });
  });

  describe("createSession", () => {
    it("should create session without MCP servers by default", async () => {
      const session = await sessionManager.createSession(
        "test-session",
        "http://example.com/repo",
      );

      expect(session.mcpServers).toBeUndefined();
    });

    it("should create session with all required fields", async () => {
      const session = await sessionManager.createSession(
        "test-session",
        "http://example.com/repo",
        "fossil-user",
        "fossil-pass",
      );

      expect(session.sessionId).toBe("test-session");
      expect(session.fossilUrl).toBe("http://example.com/repo");
      expect(session.fossilUser).toBe("fossil-user");
      expect(session.fossilPassword).toBe("fossil-pass");
      expect(session.acpProcess).toBeNull();
      expect(session.fileWatcher).not.toBeNull();
    });
  });

  describe("SessionInfo with MCP servers", () => {
    it("should allow accessing MCP servers from session info", async () => {
      const session = await sessionManager.createSession(
        "test-session",
        "http://example.com/repo",
      );

      const mcpServers: McpServerConfig[] = [
        {
          name: "postgres",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-postgres"],
        },
      ];

      sessionManager.setSessionMcpServers(session.sessionId, mcpServers);

      // Simulate what AcpClient would do
      const sessionInfo = sessionManager.getSession(session.sessionId);
      expect(sessionInfo?.mcpServers).toBeDefined();
      expect(sessionInfo?.mcpServers?.[0].name).toBe("postgres");
      expect(sessionInfo?.mcpServers?.[0].command).toBe("npx");
    });
  });
});
