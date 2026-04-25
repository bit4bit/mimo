import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterEach,
  afterAll,
} from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { createOS } from "../src/os/node-adapter.js";
import {
  DummySharedFossilServer,
  SharedFossilServer,
  normalizeSessionIdForFossil,
} from "../src/vcs/shared-fossil-server.js";

describe("SharedFossilServer Integration Tests", () => {
  let sharedServers: any = [];

  async function aSharedFossilServer() {
    // Use a unique port for each test to avoid conflicts
    const testPort = 18000 + Math.floor(Math.random() * 7001);

    const testHome = join(
      tmpdir(),
      `mimo-shared-fossil-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "test-secret-key-for-testing",
        MIMO_SHARED_FOSSIL_SERVER_PORT: testPort,
      },
      services: {
        sharedFossil: new DummySharedFossilServer(), // Skip creating - test creates its own
      },
    });

    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });

    // Create fresh instance with test-specific port via constructor injection
    const os = createOS({ ...process.env });
    const sharedServer = new SharedFossilServer({
      port: testPort,
      reposDir: join(testHome, "session-fossils"),
    }, os);
    const testServer = { sharedServer, testHome, testPort };
    sharedServers.push(testServer);
    return testServer;
  }

  beforeEach(async () => {
    for (let testServer of sharedServers) {
      // Clean up from previous run
      try {
        rmSync(testServer.testHome, { recursive: true, force: true });
      } catch {}

      mkdirSync(testServer.testHome, { recursive: true });
    }
  });

  afterAll(async () => {
    for (const testServer of sharedServers) {
      const { sharedServer, testHome } = testServer;
      await sharedServer.stop();
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  describe("Session ID Normalization", () => {
    it("should replace hyphens with underscores", () => {
      expect(normalizeSessionIdForFossil("abc123-def456-ghi789")).toBe(
        "abc123_def456_ghi789",
      );
    });

    it("should handle session IDs without hyphens", () => {
      expect(normalizeSessionIdForFossil("abc123def456")).toBe("abc123def456");
    });

    it("should handle UUIDs with multiple hyphens", () => {
      expect(
        normalizeSessionIdForFossil("ses-abc123-def456-ghi789-jkl012"),
      ).toBe("ses_abc123_def456_ghi789_jkl012");
    });
  });

  describe("Server Lifecycle", () => {
    it("should start the shared fossil server", async () => {
      const { sharedServer } = await aSharedFossilServer();
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
      const { sharedServer } = await aSharedFossilServer();
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
      const { sharedServer } = await aSharedFossilServer();
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
    it("should generate correct fossil URL for session without .fossil extension", async () => {
      const { sharedServer, testPort } = await aSharedFossilServer();
      const sessionId = "abc123-def456";
      const url = sharedServer.getUrl(sessionId);

      // fossil server serves repos by basename only (no .fossil extension in URL)
      expect(url).not.toContain(".fossil");
      expect(url).toBe(`http://localhost:${testPort}/abc123_def456/`);
    });

    it("should generate correct fossil path for session", async () => {
      const { sharedServer } = await aSharedFossilServer();
      const sessionId = "test-session-001";
      const path = sharedServer.getFossilPath(sessionId);
      const reposDir = sharedServer.getReposDir();

      expect(path).toBe(join(reposDir, "test_session_001.fossil"));
    });
  });

  describe("Repository Directory Management", () => {
    it("should create repos directory on first access", async () => {
      const { sharedServer } = await aSharedFossilServer();
      const reposDir = sharedServer.getReposDir();

      expect(existsSync(reposDir)).toBe(true);
    });

    it("should return consistent repos directory", async () => {
      const { sharedServer } = await aSharedFossilServer();
      const dir1 = sharedServer.getReposDir();
      const dir2 = sharedServer.getReposDir();

      expect(dir1).toBe(dir2);
    });
  });

  describe("Server Port", () => {
    it("should use configured test port", async () => {
      const { sharedServer, testPort } = await aSharedFossilServer();
      expect(sharedServer.getPort()).toBe(testPort);
    });

    it("should use port passed via constructor", () => {
      const testReposDir = join(tmpdir(), `mimo-test-repos-${Date.now()}`);
      const os = createOS({ ...process.env });
      const freshServer = new SharedFossilServer({
        port: 19000,
        reposDir: testReposDir,
      }, os);

      expect(freshServer.getPort()).toBe(19000);
    });
  });

  describe("reposDir configuration", () => {
    it("should use the provided reposDir without reading environment variables", () => {
      const customReposDir = join(tmpdir(), `mimo-custom-repos-${Date.now()}`);

      // The server should use the provided reposDir directly
      // and NOT fall back to process.env.MIMO_HOME
      const os = createOS({ ...process.env });
      const server = new SharedFossilServer({
        port: 19001,
        reposDir: customReposDir,
      }, os);

      expect(server.getReposDir()).toBe(customReposDir);
    });

    it("should require reposDir to be provided (no env var fallback)", () => {
      // reposDir is now required - no fallback to env vars
      // This should throw because reposDir is undefined
      expect(() => {
        new SharedFossilServer({
          port: 19002,
          // reposDir not provided - should throw
        } as any);
      }).toThrow();
    });
  });
});
