import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { SharedFossilServer, normalizeSessionIdForFossil } from "../src/vcs/shared-fossil-server.js";

describe("SharedFossilServer Integration Tests", () => {
  let testHome: string;
  let sharedServer: SharedFossilServer;
  let testPort: number;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-shared-fossil-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    createMimoContext({ env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" } });

    // Use a unique port for each test to avoid conflicts
    testPort = 18000 + Math.floor(Math.random() * 1000);

    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });

    // Create fresh instance configured with test-specific values
    sharedServer = new SharedFossilServer();
    sharedServer.configure({ port: testPort, reposDir: join(testHome, "session-fossils") });
  });

  afterEach(async () => {
    // Stop server
    try {
      await sharedServer.stop();
    } catch {}

    // Clean up
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  describe("Session ID Normalization", () => {
    it("should replace hyphens with underscores", () => {
      expect(normalizeSessionIdForFossil("abc123-def456-ghi789"))
        .toBe("abc123_def456_ghi789");
    });

    it("should handle session IDs without hyphens", () => {
      expect(normalizeSessionIdForFossil("abc123def456"))
        .toBe("abc123def456");
    });

    it("should handle UUIDs with multiple hyphens", () => {
      expect(normalizeSessionIdForFossil("ses-abc123-def456-ghi789-jkl012"))
        .toBe("ses_abc123_def456_ghi789_jkl012");
    });
  });

  describe("Server Lifecycle", () => {
    it("should start the shared fossil server", async () => {
      // Create a test fossil file
      const sessionId = "test-session-123";
      const fossilPath = sharedServer.getFossilPath(sessionId);
      mkdirSync(sharedServer.getReposDir(), { recursive: true });
      
      // Create a minimal fossil file (just a placeholder for the test)
      writeFileSync(fossilPath, "test");

      const success = await sharedServer.start();
      
      expect(success).toBe(true);
      expect(await sharedServer.isRunning()).toBe(true);
    }, 10000);

    it("should stop the shared fossil server", async () => {
      const sessionId = "test-session-456";
      const fossilPath = sharedServer.getFossilPath(sessionId);
      mkdirSync(sharedServer.getReposDir(), { recursive: true });
      writeFileSync(fossilPath, "test");

      await sharedServer.start();
      expect(await sharedServer.isRunning()).toBe(true);

      await sharedServer.stop();
      expect(await sharedServer.isRunning()).toBe(false);
    }, 10000);

    it("should return true when starting already running server", async () => {
      const sessionId = "test-session-789";
      const fossilPath = sharedServer.getFossilPath(sessionId);
      mkdirSync(sharedServer.getReposDir(), { recursive: true });
      writeFileSync(fossilPath, "test");

      await sharedServer.start();
      
      const success = await sharedServer.start();
      expect(success).toBe(true);
    }, 10000);
  });

  describe("URL Generation", () => {
    it("should generate correct fossil URL for session without .fossil extension", () => {
      const sessionId = "abc123-def456";
      const url = sharedServer.getUrl(sessionId);
      
      // fossil server serves repos by basename only (no .fossil extension in URL)
      expect(url).not.toContain(".fossil");
      expect(url).toBe(`http://localhost:${testPort}/abc123_def456/`);
    });

    it("should generate correct fossil path for session", () => {
      const sessionId = "test-session-001";
      const path = sharedServer.getFossilPath(sessionId);
      const reposDir = sharedServer.getReposDir();
      
      expect(path).toBe(join(reposDir, "test_session_001.fossil"));
    });
  });

  describe("Repository Directory Management", () => {
    it("should create repos directory on first access", () => {
      const reposDir = sharedServer.getReposDir();
      
      expect(existsSync(reposDir)).toBe(true);
    });

    it("should return consistent repos directory", () => {
      const dir1 = sharedServer.getReposDir();
      const dir2 = sharedServer.getReposDir();
      
      expect(dir1).toBe(dir2);
    });
  });

  describe("Server Port", () => {
    it("should use configured test port", () => {
      expect(sharedServer.getPort()).toBe(testPort);
    });

    it("should use port set via configure()", () => {
      const freshServer = new SharedFossilServer();
      freshServer.configure({ port: 19000 });

      expect(freshServer.getPort()).toBe(19000);
    });
  });
});
