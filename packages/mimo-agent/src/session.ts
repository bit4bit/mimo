import {
  SessionInfo,
  FileChange,
  ModelState,
  ModeState,
  McpServerConfig,
} from "./types";
import ignore from "ignore";
import { relative } from "path";
import { logger } from "./logger.js";
import type { OS } from "./os/types.js";

export interface SessionCallbacks {
  onFileChange: (sessionId: string, changes: FileChange[]) => void;
  onSessionError: (sessionId: string, error: string) => void;
}

export class SessionManager {
  private sessions: Map<string, SessionInfo> = new Map();
  private pendingChanges: Map<string, FileChange[]> = new Map();
  private changeTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: SessionCallbacks;
  private workDir: string;
  private os: OS;

  constructor(workDir: string, callbacks: SessionCallbacks, os: OS) {
    this.workDir = os.path.resolve(workDir);
    this.callbacks = callbacks;
    this.os = os;
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  async createSession(
    sessionId: string,
    fossilUrl: string,
    fossilUser?: string,
    fossilPassword?: string,
  ): Promise<SessionInfo> {
    const checkoutPath = this.os.path.join(this.workDir, sessionId);

    logger.debug(`[mimo-agent] Creating session ${sessionId}`);
    logger.debug(`[mimo-agent]   Fossil URL: ${fossilUrl}`);
    logger.debug(`[mimo-agent]   Checkout: ${checkoutPath}`);

    // Clone/checkout logic handled by platform via fossil server
    // Just ensure the checkout directory exists
    if (!await this.os.fs.exists(checkoutPath)) {
      await this.os.fs.mkdir(checkoutPath, { recursive: true });
    }

    const sessionInfo: SessionInfo = {
      sessionId,
      checkoutPath,
      fossilUrl,
      fossilUser,
      fossilPassword,
      acpProcess: null,
      fileWatcher: null,
    };

    this.sessions.set(sessionId, sessionInfo);

    // Start file watcher and wait until it is ready before returning
    await this.startFileWatcher(sessionId, checkoutPath);

    return sessionInfo;
  }

  setSessionAcpProcess(sessionId: string, process: any): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.acpProcess = process;
    }
  }

  setSessionState(
    sessionId: string,
    modelState?: ModelState,
    modeState?: ModeState,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.modelState = modelState;
      session.modeState = modeState;
    }
  }

  setSessionMcpServers(sessionId: string, mcpServers: McpServerConfig[]): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.mcpServers = mcpServers;
    }
  }

  setSessionAgentSubpath(sessionId: string, agentSubpath: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.agentSubpath = agentSubpath;
    }
  }

  private async startFileWatcher(
    sessionId: string,
    checkoutPath: string,
  ): Promise<void> {
    logger.debug(`[mimo-agent] Starting file watcher for session ${sessionId}`);

    const VCS_INTERNALS = new Set([
      ".fossil",
      ".fslckout",
      ".fossil-settings",
      ".git",
    ]);
    const ig = ignore();
    ig.add(["node_modules", "__pycache__", "*.tmp", "*~"]);

    for (const fileName of [".gitignore", ".mimoignore"]) {
      const ignorePath = this.os.path.join(checkoutPath, fileName);
      if (await this.os.fs.exists(ignorePath)) {
        ig.add(await this.os.fs.readFile(ignorePath));
      }
    }

    const ignored = (watchPath: string): boolean => {
      const relativePath = relative(checkoutPath, watchPath).replaceAll("\\", "/");
      if (relativePath === "." || relativePath.length === 0) {
        return false;
      }
      const firstSegment = relativePath.split("/")[0];
      if (VCS_INTERNALS.has(firstSegment)) {
        return true;
      }
      return ig.ignores(relativePath);
    };

    return new Promise((resolve) => {
      const watcher = this.os.fs.watch(
        checkoutPath,
        { recursive: true, ignored },
        (eventType: string, filename: string | null) => {
          if (!filename) return;

          const srcPath = this.os.path.join(checkoutPath, filename);
          const isRenameEvent = eventType === "rename";

          (async () => {
            try {
              const fileExists = await this.os.fs.exists(srcPath);

              const change: FileChange = {
                path: filename,
                isNew: isRenameEvent && fileExists,
                deleted: isRenameEvent && !fileExists,
              };

              const changes = this.pendingChanges.get(sessionId) || [];
              changes.push(change);
              this.pendingChanges.set(sessionId, changes);

              const existingTimeout = this.changeTimeouts.get(sessionId);
              if (existingTimeout) {
                clearTimeout(existingTimeout);
              }

              const timeout = setTimeout(() => {
                this.flushPendingChanges(sessionId);
              }, 500);
              this.changeTimeouts.set(sessionId, timeout);
            } catch (err) {
              logger.error(`[mimo-agent] File watcher error:`, err);
            }
          })();
        },
      );

      watcher.on("error", (err: NodeJS.ErrnoException) => {
        logger.error(
          `[mimo-agent] File watcher failed for session ${sessionId} (${checkoutPath}): ${err.message}`,
        );
        this.stopSession(sessionId);
        this.sessions.delete(sessionId);
        throw err;
      });

      watcher.on("ready", resolve);

      const session = this.sessions.get(sessionId);
      if (session) {
        session.fileWatcher = watcher;
      }
    }); // end Promise
  }

  private flushPendingChanges(sessionId: string): void {
    const changes = this.pendingChanges.get(sessionId);
    if (!changes || changes.length === 0) return;

    this.pendingChanges.set(sessionId, []);
    this.changeTimeouts.delete(sessionId);

    // Deduplicate changes
    const uniqueChanges = new Map<string, FileChange>();
    for (const change of changes) {
      uniqueChanges.set(change.path, change);
    }

    this.callbacks.onFileChange(sessionId, Array.from(uniqueChanges.values()));
  }

  async terminateSession(sessionId: string): Promise<void> {
    this.stopSession(sessionId);
    this.sessions.delete(sessionId);

    const checkoutPath = this.os.path.join(this.workDir, sessionId);
    const repoPath = this.os.path.join(this.workDir, `${sessionId}.fossil`);

    if (await this.os.fs.exists(checkoutPath)) {
      logger.debug(
        `[mimo-agent] Closing fossil repo for session: ${sessionId}`,
      );
      try {
        await this.os.command.run(["fossil", "close"], {
          cwd: checkoutPath,
          timeoutMs: 10000,
        });
      } catch {
        // Ignore — checkout may already be closed or not a fossil repo
      }
      logger.debug(`[mimo-agent] Deleting session folder: ${checkoutPath}`);
      await this.os.fs.rm(checkoutPath, { recursive: true, force: true });
    }

    if (await this.os.fs.exists(repoPath)) {
      logger.debug(`[mimo-agent] Deleting fossil repo file: ${repoPath}`);
      await this.os.fs.unlink(repoPath);
    }
  }

  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.acpProcess && !session.acpProcess.killed) {
      // Safety-net kill: the caller should have already closed the ACP client
      // (which sends EOF and waits for the process to exit). This kill is only
      // reached if the process did not exit within the close timeout.
      logger.debug(`[mimo-agent] Force-killing ACP process for ${sessionId}`);
      session.acpProcess.kill("SIGTERM");
      session.acpProcess = null;
    }

    if (session.fileWatcher) {
      session.fileWatcher.close();
      session.fileWatcher = null;
    }

    // Clear any pending changes
    const timeout = this.changeTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.changeTimeouts.delete(sessionId);
    }
    this.pendingChanges.delete(sessionId);
  }

  stopAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.stopSession(sessionId);
    }
  }

  async terminateAll(): Promise<void> {
    for (const sessionId of Array.from(this.sessions.keys())) {
      await this.terminateSession(sessionId);
    }
  }
}
