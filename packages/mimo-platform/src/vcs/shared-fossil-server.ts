import { spawn, ChildProcess } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createConnection } from "net";
import { logger } from "../logger.js";

// Default port value
const DEFAULT_FOSSIL_PORT = 8000;

// Cached config value - populated lazily
let cachedConfigPort: number | undefined | null = null;

// Port configuration - read from config.yaml > default 8000
const getFossilServerPort = (): number => {
  // Check cached config value
  if (cachedConfigPort !== null) {
    return cachedConfigPort ?? DEFAULT_FOSSIL_PORT;
  }

  // Try to load from config file
  try {
    const { configService } = require("../config/service.js");
    const configPort = configService.get("sharedFossilServerPort");
    if (
      typeof configPort === "number" &&
      configPort >= 1024 &&
      configPort <= 65535
    ) {
      cachedConfigPort = configPort;
      return configPort;
    }
  } catch {
    // Config not available, will use default
  }

  // Mark as checked and return default
  cachedConfigPort = undefined;
  return DEFAULT_FOSSIL_PORT;
};

// Default fossil repos directory - will be overridden by configure()
let defaultFossilReposDir: string | null = null;

const getFossilReposDir = (): string => {
  if (defaultFossilReposDir) {
    return defaultFossilReposDir;
  }
  // Fallback to environment variable or hardcoded default
  if (process.env.MIMO_HOME) {
    return join(process.env.MIMO_HOME, "session-fossils");
  }
  return join(require("os").homedir(), ".mimo", "session-fossils");
};

/**
 * Normalizes a session ID to be a valid filename for Fossil URLs.
 * Fossil has strict URL path restrictions:
 * - No '-' after '/'
 * - '.' must be surrounded by alphanumeric characters
 *
 * Converts: "abc123-def456-ghi789" → "abc123_def456_ghi789"
 */
export function normalizeSessionIdForFossil(sessionId: string): string {
  return sessionId.replace(/-/g, "_");
}

/**
 * SharedFossilServer manages a single fossil server process that serves
 * multiple repositories from a centralized directory.
 *
 * This replaces the per-session FossilServerManager to reduce resource usage:
 * - Before: 1 process per session (~15MB each)
 * - After: 1 process total (~20MB total)
 *
 * Repositories are stored in ~/.mimo/session-fossils/ as:
 *   <normalized-session-id>.fossil
 *
 * And accessed via URLs:
 *   http://localhost:8000/<normalized-session-id>.fossil/
 */
export class SharedFossilServer {
  private process: ChildProcess | null = null;
  private _port: number | null = null;
  private _reposDir: string | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private restartDelayMs: number = 2000;
  private maxRestartAttempts: number = 5;
  private restartAttempts: number = 0;

  /**
   * Configure the server with values from MimoContext.
   * Must be called before the server is started.
   */
  configure(config: { reposDir?: string; port?: number }): void {
    if (config.port !== undefined) this._port = config.port;
    if (config.reposDir !== undefined) {
      this._reposDir = config.reposDir;
      // Update the module-level default for consistency
      defaultFossilReposDir = config.reposDir;
      this.ensureReposDir();
    }
  }

  /**
   * Get the port (lazy initialization)
   */
  private get port(): number {
    if (this._port === null) {
      this._port = getFossilServerPort();
    }
    return this._port;
  }

  /**
   * Get the repos directory (lazy initialization)
   * This allows the server to be imported before paths are fully configured
   */
  private get reposDir(): string {
    if (this._reposDir === null) {
      this._reposDir = getFossilReposDir();
      this.ensureReposDir();
    }
    return this._reposDir;
  }

  private ensureReposDir(): void {
    if (this._reposDir && !existsSync(this._reposDir)) {
      mkdirSync(this._reposDir, { recursive: true });
      logger.debug(
        `[SharedFossilServer] Created repos directory: ${this._reposDir}`,
      );
    }
  }

  /**
   * Check if the configured port is available
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection(port, "localhost");
      socket.setTimeout(1000); // 1 second timeout
      socket.on("connect", () => {
        socket.destroy();
        resolve(false); // Port is in use
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(true); // Connection timed out, port is available
      });
      socket.on("error", (err: any) => {
        socket.destroy();
        // ECONNREFUSED means port is available, other errors might mean available too
        resolve(err.code === "ECONNREFUSED" || err.code === "ECONNRESET");
      });
    });
  }

  /**
   * Start the shared fossil server.
   * The server will serve all .fossil files in the repos directory.
   *
   * @returns {Promise<boolean>} true if started successfully, false otherwise
   */
  async start(): Promise<boolean> {
    if (this.process !== null) {
      logger.debug("[SharedFossilServer] Server already running");
      return true;
    }

    // Ensure repos directory exists
    this.ensureReposDir();

    // Check if port is available
    const available = await this.isPortAvailable(this.port);
    if (!available) {
      logger.warn(`[SharedFossilServer] Port ${this.port} is already in use`);
      logger.warn(
        "[SharedFossilServer] A fossil server may already be running on this port",
      );
      logger.warn(
        "[SharedFossilServer] Attempting to use the existing server...",
      );

      // Check if it's actually a fossil server by trying to connect
      try {
        const response = await fetch(`http://localhost:${this.port}/`);
        if (response.ok || response.status === 404) {
          // Server is responding, assume it's a fossil server
          logger.debug(
            `[SharedFossilServer] Existing server on port ${this.port} is responsive`,
          );
          // Mark as "running" without our own process
          this.restartAttempts = 0;
          return true;
        }
      } catch {
        logger.error(
          `[SharedFossilServer] Port ${this.port} is in use but not responding as expected`,
        );
        logger.error(
          "[SharedFossilServer] You may need to kill the existing process or use a different port",
        );
        return false;
      }
      // If we get here, the check didn't throw but also didn't return true
      return false;
    }

    // Start fossil server serving the entire directory
    // fossil server --port <port> <directory>
    // This makes all .fossil files in the directory accessible via URL:
    // http://localhost:<port>/<filename>.fossil/
    logger.debug(
      `[SharedFossilServer] Starting server on port ${this.port} serving ${this.reposDir}`,
    );

    this.process = spawn(
      "fossil",
      ["server", "--port", this.port.toString(), this.reposDir],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        cwd: this.reposDir, // Ensure fossil server has valid working directory
      },
    );

    // Reset restart attempts on successful start
    this.restartAttempts = 0;

    // Wait a moment for the server to start
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if process started successfully
    if (this.process.pid === undefined) {
      logger.error("[SharedFossilServer] Failed to start fossil server");
      this.process = null;
      return false;
    }

    logger.debug(
      `[SharedFossilServer] Server started with PID ${this.process.pid}`,
    );

    // Set up process event handlers
    this.process.on("exit", (code, signal) => {
      logger.debug(
        `[SharedFossilServer] Server process exited (code: ${code}, signal: ${signal})`,
      );
      this.process = null;

      // Trigger watchdog restart if not a deliberate stop
      if (signal !== "SIGTERM" && signal !== "SIGINT") {
        this.scheduleRestart();
      }
    });

    this.process.on("error", (err) => {
      logger.error("[SharedFossilServer] Server process error:", err);
    });

    // Log stderr for debugging
    this.process.stderr?.on("data", (data) => {
      logger.error("[SharedFossilServer] stderr:", data.toString().trim());
    });

    return true;
  }

  /**
   * Stop the shared fossil server gracefully.
   */
  async stop(): Promise<void> {
    if (this.process === null) {
      return;
    }

    logger.debug("[SharedFossilServer] Stopping server...");

    // Cancel any pending restart
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    // Kill the process
    this.process.kill("SIGTERM");

    // Wait for process to exit with timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if graceful shutdown takes too long
        if (this.process) {
          this.process.kill("SIGKILL");
        }
        resolve();
      }, 5000);

      this.process?.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
    logger.debug("[SharedFossilServer] Server stopped");
  }

  /**
   * Check if the server is currently running.
   * Checks both our own process and if an external server is responding on the port.
   */
  async isRunning(): Promise<boolean> {
    // First check if we have our own process running
    if (this.process !== null && this.process.pid !== undefined) {
      return true;
    }

    // Also check if there's an external server responding on our port
    try {
      const response = await fetch(`http://localhost:${this.port}/`, {
        signal: AbortSignal.timeout(1000),
      });
      return response.ok || response.status === 404;
    } catch {
      return false;
    }
  }

  /**
   * Get the URL for a specific session's fossil repository.
   *
   * When fossil server serves a directory, repositories are accessed by their
   * basename without the .fossil extension.
   *
   * @param sessionId The session ID (e.g., "abc123-def456-ghi789")
   * @returns The full URL to access the repository (e.g., "http://localhost:8000/abc123_def456_ghi789/")
   */
  getUrl(sessionId: string): string {
    const normalizedId = normalizeSessionIdForFossil(sessionId);
    return `http://localhost:${this.port}/${normalizedId}/`;
  }

  /**
   * Get the filesystem path for a session's fossil repository.
   *
   * @param sessionId The session ID
   * @returns The full path to the .fossil file
   */
  getFossilPath(sessionId: string): string {
    const normalizedId = normalizeSessionIdForFossil(sessionId);
    return join(this.reposDir, `${normalizedId}.fossil`);
  }

  /**
   * Get the centralized directory where all fossil repos are stored.
   */
  getReposDir(): string {
    return this.reposDir;
  }

  /**
   * Get the port the server is configured to use.
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Ensure the server is running. If not, start it.
   * @returns {Promise<boolean>} true if server is running or was started successfully
   */
  async ensureRunning(): Promise<boolean> {
    if (await this.isRunning()) {
      return true;
    }
    return this.start();
  }

  /**
   * Schedule a restart of the server (watchdog functionality).
   * Will retry up to maxRestartAttempts with increasing delays.
   */
  private scheduleRestart(): void {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      logger.error(
        `[SharedFossilServer] Max restart attempts (${this.maxRestartAttempts}) reached. Giving up.`,
      );
      return;
    }

    this.restartAttempts++;
    const delay = this.restartDelayMs * this.restartAttempts;

    logger.debug(
      `[SharedFossilServer] Scheduling restart attempt ${this.restartAttempts}/${this.maxRestartAttempts} in ${delay}ms`,
    );

    this.watchdogTimer = setTimeout(async () => {
      logger.debug("[SharedFossilServer] Watchdog attempting restart...");
      const success = await this.start();
      if (success) {
        logger.debug("[SharedFossilServer] Watchdog restart successful");
      } else {
        logger.error(
          "[SharedFossilServer] Watchdog restart failed, will retry",
        );
      }
    }, delay);
  }
}

// Export singleton instance
export const sharedFossilServer = new SharedFossilServer();

// Cleanup on process termination signals
// SIGINT: Ctrl+C
// SIGTERM: Graceful termination request
process.on("SIGINT", () => {
  logger.debug("[SharedFossilServer] Received SIGINT, stopping server...");
  sharedFossilServer
    .stop()
    .then(() => {
      logger.debug("[SharedFossilServer] Server stopped, exiting...");
      process.exit(0);
    })
    .catch((err) => {
      logger.error("[SharedFossilServer] Error during stop:", err);
      process.exit(1);
    });
});

process.on("SIGTERM", () => {
  logger.debug("[SharedFossilServer] Received SIGTERM, stopping server...");
  sharedFossilServer
    .stop()
    .then(() => {
      logger.debug("[SharedFossilServer] Server stopped, exiting...");
      process.exit(0);
    })
    .catch((err) => {
      logger.error("[SharedFossilServer] Error during stop:", err);
      process.exit(1);
    });
});
