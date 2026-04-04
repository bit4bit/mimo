import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync } from "fs";

describe("Fossil Server Manager Integration Tests", () => {
  let testHome: string;
  let FossilServerManager: any;
  let fossilServerManager: any;
  let VCS: any;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-fossil-server-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    process.env.MIMO_HOME = testHome;
    
    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
    
    mkdirSync(testHome, { recursive: true });

    // Re-import to get fresh modules
    const vcsModule = await import("../src/vcs/index.ts");
    VCS = vcsModule.VCS;

    const serverModule = await import("../src/vcs/fossil-server.ts");
    FossilServerManager = serverModule.FossilServerManager;
    fossilServerManager = serverModule.fossilServerManager;
  });

  afterEach(async () => {
    // Stop all servers
    try {
      await fossilServerManager.stopAllServers();
    } catch {}
    
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  describe("Port Management", () => {
    it("should assign ports in 8000-9000 range", async () => {
      const port = await fossilServerManager.assignPort();
      
      expect(port).toBeGreaterThanOrEqual(8000);
      expect(port).toBeLessThanOrEqual(9000);
    });

    it("should assign unique ports", async () => {
      const port1 = await fossilServerManager.assignPort();
      const port2 = await fossilServerManager.assignPort();
      
      expect(port1).not.toBe(port2);
    });

    it("should release ports", async () => {
      const port = await fossilServerManager.assignPort();
      fossilServerManager.releasePort(port);
      
      // Port should be available again
      const newPort = await fossilServerManager.assignPort();
      // Not guaranteed to be the same, but should be in range
      expect(newPort).toBeGreaterThanOrEqual(8000);
      expect(newPort).toBeLessThanOrEqual(9000);
    });
  });

  describe("Server Lifecycle", () => {
    it("should start a Fossil server", async () => {
      const vcs = new VCS();
      const repoPath = join(testHome, "test.fossil");
      await vcs.createFossilRepo(repoPath);

      const result = await fossilServerManager.startServer("test-session", repoPath);

      expect(result.port).toBeDefined();
      expect(result.port).toBeGreaterThanOrEqual(8000);
      expect(result.port).toBeLessThanOrEqual(9000);

      // Server should be tracked
      expect(fossilServerManager.isServerRunning("test-session")).toBe(true);

      // Cleanup
      await fossilServerManager.stopServer("test-session");
    }, 15000);

    it("should stop a Fossil server", async () => {
      const vcs = new VCS();
      const repoPath = join(testHome, "stop-test.fossil");
      await vcs.createFossilRepo(repoPath);

      await fossilServerManager.startServer("stop-session", repoPath);
      expect(fossilServerManager.isServerRunning("stop-session")).toBe(true);

      await fossilServerManager.stopServer("stop-session");
      expect(fossilServerManager.isServerRunning("stop-session")).toBe(false);
    }, 15000);

    it("should return existing server for same session", async () => {
      const vcs = new VCS();
      const repoPath = join(testHome, "existing.fossil");
      await vcs.createFossilRepo(repoPath);

      const result1 = await fossilServerManager.startServer("existing-session", repoPath);
      const result2 = await fossilServerManager.startServer("existing-session", repoPath);

      expect(result1.port).toBe(result2.port);

      // Cleanup
      await fossilServerManager.stopServer("existing-session");
    }, 15000);

    it("should fail with PORTS_EXHAUSTED when no ports available", async () => {
      const vcs = new VCS();
      const repoPath = join(testHome, "exhausted.fossil");
      await vcs.createFossilRepo(repoPath);

      // Exhaust all ports
      const ports: number[] = [];
      for (let i = 0; i < 1001; i++) {
        const port = await fossilServerManager.assignPort();
        ports.push(port);
      }

      // Try to start server - should fail
      const result = await fossilServerManager.startServer("exhausted-session", repoPath);
      expect(result.error).toBe("PORTS_EXHAUSTED");

      // Release ports
      ports.forEach(port => fossilServerManager.releasePort(port));
    }, 60000);

    it("should fail if repo file does not exist", async () => {
      const result = await fossilServerManager.startServer(
        "nonexistent-session",
        "/nonexistent/path.fossil"
      );

      expect(result.error).toContain("Repository not found");
    });
  });

  describe("Server Tracking", () => {
    it("should track running servers", async () => {
      const vcs = new VCS();
      const repoPath1 = join(testHome, "track1.fossil");
      const repoPath2 = join(testHome, "track2.fossil");
      await vcs.createFossilRepo(repoPath1);
      await vcs.createFossilRepo(repoPath2);

      await fossilServerManager.startServer("session-1", repoPath1);
      await fossilServerManager.startServer("session-2", repoPath2);

      expect(fossilServerManager.getActiveServerCount()).toBe(2);
      expect(fossilServerManager.isServerRunning("session-1")).toBe(true);
      expect(fossilServerManager.isServerRunning("session-2")).toBe(true);

      await fossilServerManager.stopAllServers();
      expect(fossilServerManager.getActiveServerCount()).toBe(0);
    }, 15000);

    it("should return server info for running server", async () => {
      const vcs = new VCS();
      const repoPath = join(testHome, "info.fossil");
      await vcs.createFossilRepo(repoPath);

      const result = await fossilServerManager.startServer("info-session", repoPath);
      const info = fossilServerManager.getRunningServer("info-session");

      expect(info).not.toBeNull();
      expect(info?.port).toBe(result.port);
      expect(info?.repoPath).toBe(repoPath);

      await fossilServerManager.stopServer("info-session");
    }, 15000);

    it("should return null for non-running server", () => {
      const info = fossilServerManager.getRunningServer("nonexistent");
      expect(info).toBeNull();
    });
  });
});