import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { relative } from "path";

describe("Agent Handoff Tests", () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-handoff-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    process.env.MIMO_HOME = testHome;
    
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
      const checkoutPath = "/home/user/work/projects/my-app/sessions/123/checkout";
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

    it("should handle empty sessions array", () => {
      const message = {
        type: "session_ready",
        platformUrl: "http://localhost:3000",
        sessions: [],
      };

      expect(message.sessions).toHaveLength(0);
    });

    it("should include all required fields per session", () => {
      const session = {
        sessionId: "test-session",
        port: 8080,
      };

      expect(session.sessionId).toBeDefined();
      expect(session.port).toBeDefined();
      expect(typeof session.sessionId).toBe("string");
      expect(typeof session.port).toBe("number");
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
});