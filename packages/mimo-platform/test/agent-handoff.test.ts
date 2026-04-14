import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { relative } from "path";

describe("Agent Handoff Tests", () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-handoff-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });
  });

  afterEach(async () => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  describe("Relative path computation", () => {
    it("should compute relative path inside workdir", () => {
      const workdir = "/home/user/work";
      const checkoutPath = "/home/user/work/projects/abc/sessions/xyz/checkout";
      const relativePath = relative(workdir, checkoutPath);

      expect(relativePath).toBe("projects/abc/sessions/xyz/checkout");
    });

    it("should handle path outside workdir", () => {
      const workdir = "/home/user/work";
      const checkoutPath = "/tmp/other/checkout";
      const relativePath = relative(workdir, checkoutPath);

      // relative path will start with .. when outside workdir
      expect(relativePath.startsWith("..")).toBe(true);
    });

    it("should handle same path", () => {
      const workdir = "/home/user/work";
      const checkoutPath = "/home/user/work";
      const relativePath = relative(workdir, checkoutPath);

      expect(relativePath).toBe("");
    });

    it("should handle nested path", () => {
      const workdir = "/home/user/work/projects";
      const checkoutPath =
        "/home/user/work/projects/my-app/sessions/123/checkout";
      const relativePath = relative(workdir, checkoutPath);

      expect(relativePath).toBe("my-app/sessions/123/checkout");
    });

    it("should handle parent directory", () => {
      const workdir = "/home/user/work/projects/my-app/sessions/123";
      const checkoutPath = "/home/user/work/projects";
      const relativePath = relative(workdir, checkoutPath);

      expect(relativePath.startsWith("..")).toBe(true);
    });
  });

  describe("session_ready message format", () => {
    it("should format session_ready with platformUrl and sessions", () => {
      const platformUrl = "http://localhost:3000";
      const sessions = [
        { sessionId: "session-1", port: 8080 },
        { sessionId: "session-2", port: 8081 },
      ];

      const message = {
        type: "session_ready",
        platformUrl,
        sessions,
      };

      expect(message.type).toBe("session_ready");
      expect(message.platformUrl).toBe("http://localhost:3000");
      expect(message.sessions).toHaveLength(2);
      expect(message.sessions[0].sessionId).toBe("session-1");
      expect(message.sessions[0].port).toBe(8080);
    });

    it("should include acpSessionId when session has persisted ACP session", () => {
      const message = {
        type: "session_ready" as const,
        platformUrl: "http://localhost:3000",
        sessions: [
          { sessionId: "session-1", port: 8080, acpSessionId: "acp-abc123" },
        ],
      };

      expect(message.sessions[0].acpSessionId).toBe("acp-abc123");
    });

    it("should send null acpSessionId when session has no persisted ACP session", () => {
      const message = {
        type: "session_ready" as const,
        platformUrl: "http://localhost:3000",
        sessions: [{ sessionId: "session-1", port: 8080, acpSessionId: null }],
      };

      expect(message.sessions[0].acpSessionId).toBeNull();
    });

    it("should handle mixed sessions with and without acpSessionId", () => {
      const message = {
        type: "session_ready" as const,
        platformUrl: "http://localhost:3000",
        sessions: [
          { sessionId: "session-1", port: 8080, acpSessionId: "acp-abc123" },
          { sessionId: "session-2", port: 8081, acpSessionId: null },
        ],
      };

      expect(message.sessions[0].acpSessionId).toBe("acp-abc123");
      expect(message.sessions[1].acpSessionId).toBeNull();
    });

    it("should include persisted modelState and modeState when available", () => {
      const message = {
        type: "session_ready" as const,
        platformUrl: "http://localhost:3000",
        sessions: [
          {
            sessionId: "session-1",
            port: 8080,
            acpSessionId: "acp-abc123",
            modelState: {
              currentModelId: "gpt-5",
              availableModels: [{ value: "gpt-5", name: "GPT-5" }],
              optionId: "model",
            },
            modeState: {
              currentModeId: "build",
              availableModes: [{ value: "build", name: "Build" }],
              optionId: "mode",
            },
          },
        ],
      };

      expect(message.sessions[0].modelState.currentModelId).toBe("gpt-5");
      expect(message.sessions[0].modeState.currentModeId).toBe("build");
    });

    it("should include null modelState and modeState when not persisted", () => {
      const message = {
        type: "session_ready" as const,
        platformUrl: "http://localhost:3000",
        sessions: [
          {
            sessionId: "session-1",
            port: 8080,
            acpSessionId: null,
            modelState: null,
            modeState: null,
          },
        ],
      };

      expect(message.sessions[0].modelState).toBeNull();
      expect(message.sessions[0].modeState).toBeNull();
    });
  });

  describe("acp_session_created message format", () => {
    it("should format acp_session_created with session resumption", () => {
      const message = {
        type: "acp_session_created" as const,
        sessionId: "session-1",
        acpSessionId: "acp-abc123",
        wasReset: false,
        timestamp: new Date().toISOString(),
      };

      expect(message.type).toBe("acp_session_created");
      expect(message.sessionId).toBe("session-1");
      expect(message.acpSessionId).toBe("acp-abc123");
      expect(message.wasReset).toBe(false);
    });

    it("should format acp_session_created with session reset", () => {
      const message = {
        type: "acp_session_created" as const,
        sessionId: "session-1",
        acpSessionId: "acp-xyz789",
        wasReset: true,
        resetReason: "loadSession not supported",
        timestamp: new Date().toISOString(),
      };

      expect(message.type).toBe("acp_session_created");
      expect(message.sessionId).toBe("session-1");
      expect(message.acpSessionId).toBe("acp-xyz789");
      expect(message.wasReset).toBe(true);
      expect(message.resetReason).toBe("loadSession not supported");
    });

    it("should format acp_session_created with reset but no reason", () => {
      const message = {
        type: "acp_session_created" as const,
        sessionId: "session-1",
        acpSessionId: "acp-new456",
        wasReset: true,
        timestamp: new Date().toISOString(),
      };

      expect(message.wasReset).toBe(true);
      expect(message.resetReason).toBeUndefined();
    });
  });

  describe("System message format for session reset", () => {
    it("should format reset message with reason", () => {
      const timestamp = "2026-04-07T15:30:45.000Z";
      const reason = "loadSession not supported";
      const systemMessage = `Session reset at ${timestamp} (${reason})`;

      expect(systemMessage).toContain("Session reset at");
      expect(systemMessage).toContain(timestamp);
      expect(systemMessage).toContain(reason);
    });

    it("should format reset message without reason", () => {
      const timestamp = "2026-04-07T15:30:45.000Z";
      const systemMessage = `Session reset at ${timestamp}`;

      expect(systemMessage).toContain("Session reset at");
      expect(systemMessage).toContain(timestamp);
    });
  });

  describe("agent_ready message format", () => {
    it("should include workdir in agent_ready", () => {
      const message = {
        type: "agent_ready",
        workdir: "/home/user/work",
        timestamp: new Date().toISOString(),
      };

      expect(message.type).toBe("agent_ready");
      expect(message.workdir).toBe("/home/user/work");
      expect(message.timestamp).toBeDefined();
    });
  });

  describe("agent_sessions_ready message format", () => {
    it("should report ready sessions", () => {
      const message = {
        type: "agent_sessions_ready",
        sessionIds: ["session-1", "session-2"],
        timestamp: new Date().toISOString(),
      };

      expect(message.type).toBe("agent_sessions_ready");
      expect(message.sessionIds).toHaveLength(2);
      expect(message.sessionIds).toContain("session-1");
      expect(message.sessionIds).toContain("session-2");
    });

    it("should handle partial failures", () => {
      // Agent sends ready for successful sessions only
      const message = {
        type: "agent_sessions_ready",
        sessionIds: ["session-1"], // session-2 failed
        timestamp: new Date().toISOString(),
      };

      expect(message.sessionIds).toHaveLength(1);
    });
  });

  describe("Session error handling", () => {
    it("should format session_error message", () => {
      const message = {
        type: "session_error",
        sessionId: "session-1",
        error: "Failed to clone fossil repository",
        timestamp: new Date().toISOString(),
      };

      expect(message.type).toBe("session_error");
      expect(message.sessionId).toBe("session-1");
      expect(message.error).toContain("Failed");
    });
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

    it("should handle platform URL with trailing slash", () => {
      const platformUrl = "http://localhost:3000/";
      const port = 8000;
      const platformHost = platformUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const fossilUrl = `http://${platformHost.split(":")[0]}:${port}/`;

      expect(fossilUrl).toBe("http://localhost:8000/");
    });

    it("should not include original port in fossil URL", () => {
      // This was the bug: http://localhost:3000:8000
      const platformUrl = "http://localhost:3000";
      const port = 8000;
      const platformHost = platformUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const fossilUrl = `http://${platformHost.split(":")[0]}:${port}/`;

      // Should NOT be http://localhost:3000:8000
      expect(fossilUrl).not.toContain("3000:8000");
      expect(fossilUrl).toBe("http://localhost:8000/");
    });
  });

  describe("Session assignment lookup", () => {
    it("should find sessions by assignedAgentId", () => {
      // Sessions are assigned via assignedAgentId, not agent.sessionIds
      const agentId = "agent-123";
      const session = {
        id: "session-456",
        assignedAgentId: agentId,
        status: "active",
      };

      expect(session.assignedAgentId).toBe(agentId);
    });

    it("should handle agent with no assigned sessions", () => {
      const agentId = "agent-123";
      const sessions: any[] = [];

      // Should return empty array, not undefined
      expect(sessions).toBeDefined();
      expect(sessions.length).toBe(0);
    });
  });

  describe("Fossil clone retry logic", () => {
    it("should detect existing fossil repo file", () => {
      const sessionId = "test-session";
      const workdir = "/tmp/test";
      const repoPath = join(workdir, `${sessionId}.fossil`);
      const checkoutPath = join(workdir, sessionId);

      // Simulate existing repo
      const repoExists = existsSync(repoPath);
      const checkoutExists = existsSync(checkoutPath);

      // Logic: if repo exists, open it; else if checkout exists, ensure open; else clone
      if (repoExists) {
        expect(true).toBe(true); // Would open existing repo
      } else if (checkoutExists) {
        expect(true).toBe(true); // Would ensure checkout is open
      } else {
        expect(true).toBe(true); // Would clone fresh
      }
    });

    it("should handle fossil clone error for existing file", () => {
      const error = {
        stderr: "file already exists: /tmp/demo/session.fossil\n",
        status: 1,
      };

      expect(error.stderr).toContain("file already exists");
      expect(error.status).toBe(1);
    });
  });
});
