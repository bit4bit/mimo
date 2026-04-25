import type { OS } from "../os/types.js";

interface RunningServer {
  process: ReturnType<OS["command"]["spawn"]>;
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

export interface FossilServerDeps {
  os: OS;
}

export class FossilServerManager {
  private os: OS;

  constructor(deps: FossilServerDeps) {
    this.os = deps.os;
  }

  start(repoPath: string, port: number = getNextPort()): Promise<ServerResult> {
    return new Promise((resolve) => {
      if (!this.os.fs.exists(repoPath)) {
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
      const proc = this.os.command.spawn(
        ["fossil", "server", repoPath, "--port", port.toString()],
        {
          stdio: "pipe",
        },
      );

      let started = false;
      let errorOutput = "";

      // Read stdout
      const stdoutReader = proc.stdout.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await stdoutReader.read();
            if (done) break;
            const output = new TextDecoder().decode(value);
            if (
              (!started && output.includes("Listening")) ||
              output.includes("listening")
            ) {
              started = true;
            }
          }
        } catch {}
      })();

      // Read stderr
      const stderrReader = proc.stderr.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;
            errorOutput += new TextDecoder().decode(value);
          }
        } catch {}
      })();

      proc.exited.then((code) => {
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
        if (!started) {
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
          proc.kill("SIGTERM");
          resolve({
            success: false,
            error: errorOutput || "Server failed to start",
          });
        }
      }, 500);
    });
  }

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

      server.process.kill("SIGTERM");
      runningServers.delete(port);

      resolve({
        success: true,
        port,
      });
    });
  }

  isRunning(port: number): boolean {
    const server = runningServers.get(port);
    if (!server) return false;

    // Check if process is still alive
    return true; // SpawnedProcess doesn't expose exitCode synchronously
  }

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
  }

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
  }

  stopAll(): Promise<void> {
    return new Promise((resolve) => {
      const promises = [];
      for (const [port] of runningServers) {
        promises.push(this.stop(port));
      }
      Promise.all(promises).then(() => resolve());
    });
  }
}

// Legacy singleton for backward compatibility
let _fossilServerManager: FossilServerManager | undefined;

export function getFossilServerManager(os: OS): FossilServerManager {
  if (!_fossilServerManager) {
    _fossilServerManager = new FossilServerManager({ os });
  }
  return _fossilServerManager;
}

// Cleanup on process exit - these should be registered by the caller
export function registerCleanupHandlers(manager: FossilServerManager): void {
  process.on("exit", () => {
    manager.stopAll();
  });

  process.on("SIGINT", () => {
    manager.stopAll().then(() => {
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    manager.stopAll().then(() => {
      process.exit(0);
    });
  });
}
