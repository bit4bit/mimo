import { spawn } from "child_process";
import { existsSync } from "fs";

interface RunningServer {
  process: ReturnType<typeof spawn>;
  port: number;
  repoPath: string;
  startTime: Date;
}

const runningServers: Map<number, RunningServer> = new Map();
let nextPort = 8000;

export function getNextPort(): number {
  const port = nextPort;
  nextPort++;
  if (nextPort > 9000) {
    nextPort = 8000; // Wrap around
  }
  return port;
}

export interface ServerResult {
  success: boolean;
  port?: number;
  error?: string;
}

export interface ServerInfo {
  port: number;
  repoPath: string;
  startTime: Date;
}

export const fossilServer = {
  start(repoPath: string, port: number = getNextPort()): Promise<ServerResult> {
    return new Promise((resolve) => {
      if (!existsSync(repoPath)) {
        resolve({
          success: false,
          error: `Repository not found: ${repoPath}`,
        });
        return;
      }

      // Check if port is already in use
      if (runningServers.has(port)) {
        resolve({
          success: false,
          error: `Port ${port} is already in use`,
        });
        return;
      }

      // Start fossil server
      const proc = spawn("fossil", ["server", repoPath, "--port", port.toString()], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      let started = false;
      let errorOutput = "";

      proc.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        // Fossil server usually outputs something when it starts
        if (!started && output.includes("Listening") || output.includes("listening")) {
          started = true;
        }
      });

      proc.stderr?.on("data", (data: Buffer) => {
        errorOutput += data.toString();
      });

      proc.on("error", (err) => {
        if (!started) {
          resolve({
            success: false,
            error: err.message,
          });
        }
      });

      proc.on("exit", (code) => {
        runningServers.delete(port);
        if (!started) {
          resolve({
            success: false,
            error: errorOutput || `Server exited with code ${code}`,
          });
        }
      });

      // Give the server a moment to start
      setTimeout(() => {
        if (!started && proc.exitCode === null) {
          // Server is still running, assume it's started
          started = true;
        }

        if (started) {
          runningServers.set(port, {
            process: proc,
            port,
            repoPath,
            startTime: new Date(),
          });

          resolve({
            success: true,
            port,
          });
        } else {
          proc.kill();
          resolve({
            success: false,
            error: errorOutput || "Server failed to start",
          });
        }
      }, 500);
    });
  },

  stop(port: number): Promise<ServerResult> {
    return new Promise((resolve) => {
      const server = runningServers.get(port);
      if (!server) {
        resolve({
          success: false,
          error: `No server running on port ${port}`,
        });
        return;
      }

      server.process.kill();
      runningServers.delete(port);

      resolve({
        success: true,
        port,
      });
    });
  },

  isRunning(port: number): boolean {
    const server = runningServers.get(port);
    if (!server) return false;

    // Check if process is still alive
    return server.process.exitCode === null;
  },

  async healthCheck(port: number): Promise<boolean> {
    const server = runningServers.get(port);
    if (!server) return false;

    try {
      // Try to connect to the server
      const response = await fetch(`http://localhost:${port}`, {
        method: "GET",
      });
      return response.status === 200;
    } catch {
      return false;
    }
  },

  listRunning(): ServerInfo[] {
    const servers: ServerInfo[] = [];
    for (const [port, server] of runningServers) {
      if (this.isRunning(port)) {
        servers.push({
          port: server.port,
          repoPath: server.repoPath,
          startTime: server.startTime,
        });
      }
    }
    return servers;
  },

  stopAll(): Promise<void> {
    return new Promise((resolve) => {
      const promises = [];
      for (const [port] of runningServers) {
        promises.push(this.stop(port));
      }
      Promise.all(promises).then(() => resolve());
    });
  },
};

// Cleanup on process exit
process.on("exit", () => {
  fossilServer.stopAll();
});

process.on("SIGINT", () => {
  fossilServer.stopAll().then(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  fossilServer.stopAll().then(() => {
    process.exit(0);
  });
});
