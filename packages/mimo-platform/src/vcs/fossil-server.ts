import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";

const PORT_RANGE_START = 8000;
const PORT_RANGE_END = 9000;

interface RunningServer {
  port: number;
  process: ChildProcess;
  repoPath: string;
}

export class FossilServerManager {
  private portsInUse: Set<number> = new Set();
  private runningServers: Map<string, RunningServer> = new Map();

  assignPort(): number | null {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      if (!this.portsInUse.has(port)) {
        this.portsInUse.add(port);
        return port;
      }
    }
    return null;
  }

  releasePort(port: number): void {
    this.portsInUse.delete(port);
  }

  async startServer(sessionId: string, repoPath: string): Promise<{ port: number } | { error: string }> {
    // Check if server already running for this session
    if (this.runningServers.has(sessionId)) {
      const server = this.runningServers.get(sessionId)!;
      return { port: server.port };
    }

    // Check if repo exists
    if (!existsSync(repoPath)) {
      return { error: `Repository not found: ${repoPath}` };
    }

    // Assign port
    const port = this.assignPort();
    if (port === null) {
      return { error: "PORTS_EXHAUSTED" };
    }

    // Start fossil server
    const proc = spawn("fossil", ["server", "--port", port.toString(), repoPath], {
      stdio: "pipe",
      detached: false,
    });

    // Wait for server to start (simple check: wait a bit)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if process started successfully
    if (proc.pid === undefined) {
      this.releasePort(port);
      return { error: "Failed to start Fossil server" };
    }

    // Track running server
    this.runningServers.set(sessionId, {
      port,
      process: proc,
      repoPath,
    });

    // Handle process exit
    proc.on("exit", () => {
      this.runningServers.delete(sessionId);
      this.releasePort(port);
    });

    return { port };
  }

  async stopServer(sessionId: string): Promise<void> {
    const server = this.runningServers.get(sessionId);
    if (!server) {
      return;
    }

    // Kill the process
    server.process.kill("SIGTERM");

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      server.process.on("exit", () => {
        resolve();
      });
      // Force kill after 5 seconds
      setTimeout(() => {
        server.process.kill("SIGKILL");
        resolve();
      }, 5000);
    });

    // Cleanup
    this.runningServers.delete(sessionId);
    this.releasePort(server.port);
  }

  getRunningServer(sessionId: string): { port: number; repoPath: string } | null {
    const server = this.runningServers.get(sessionId);
    if (!server) {
      return null;
    }
    return { port: server.port, repoPath: server.repoPath };
  }

  isServerRunning(sessionId: string): boolean {
    return this.runningServers.has(sessionId);
  }

  getActiveServerCount(): number {
    return this.runningServers.size;
  }

  async stopAllServers(): Promise<void> {
    const stopPromises = Array.from(this.runningServers.keys()).map((sessionId) =>
      this.stopServer(sessionId)
    );
    await Promise.all(stopPromises);
  }
}

export const fossilServerManager = new FossilServerManager();