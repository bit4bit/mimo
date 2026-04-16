import {
  SessionInfo,
  FileChange,
  ModelState,
  ModeState,
  McpServerConfig,
} from "./types";
import { logger } from "./logger.js";
import { resolve, join, dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  unlinkSync,
  statSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  Stats,
} from "node:fs";
import { watch as chokidarWatch, FSWatcher } from "chokidar";
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

  constructor(workDir: string, callbacks: SessionCallbacks) {
    this.workDir = resolve(workDir);
    this.callbacks = callbacks;
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
    const checkoutPath = join(this.workDir, sessionId);

    logger.debug(`[mimo-agent] Creating session ${sessionId}`);
    logger.debug(`[mimo-agent]   Fossil URL: ${fossilUrl}`);
    logger.debug(`[mimo-agent]   Checkout: ${checkoutPath}`);

    // Clone/checkout logic handled by platform via fossil server
    // Just ensure the checkout directory exists
    if (!existsSync(checkoutPath)) {
      mkdirSync(checkoutPath, { recursive: true });
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

    // Start file watcher
    this.startFileWatcher(sessionId, checkoutPath);

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

  setSessionAcpSessionId(sessionId: string, acpSessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.acpSessionId = acpSessionId;
    }
  }

  setSessionLocalDevMirrorPath(
    sessionId: string,
    localDevMirrorPath: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.localDevMirrorPath = localDevMirrorPath;

      // Flush any pending changes that were detected by the file watcher
      // before the mirror path was set. This ensures files that changed
      // during setupCheckout are synced on-demand without scanning the entire repo.
      const pendingChanges = this.pendingChanges.get(sessionId);
      if (pendingChanges && pendingChanges.length > 0) {
        logger.debug(
          `[mimo-agent] Flushing ${pendingChanges.length} pending changes to mirror for session ${sessionId}`,
        );
        // Clear the timeout to prevent double-flush
        const timeout = this.changeTimeouts.get(sessionId);
        if (timeout) {
          clearTimeout(timeout);
          this.changeTimeouts.delete(sessionId);
        }
        // Flush immediately - flushPendingChanges will clear changes after sync
        this.flushPendingChanges(sessionId);
      }
    }
  }

  setSessionMcpServers(sessionId: string, mcpServers: McpServerConfig[]): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.mcpServers = mcpServers;
    }
  }

  private startFileWatcher(sessionId: string, checkoutPath: string): void {
    logger.debug(`[mimo-agent] Starting file watcher for session ${sessionId}`);

    // Use chokidar for reliable cross-platform file watching
    // It handles file modifications on Linux properly (unlike fs.watch)
    // Use native file watching by default for lower CPU usage
    // Can be enabled with MIMO_AGENT_POLLING=1 for systems with inotify issues
    const usePolling = !!process.env.MIMO_AGENT_POLLING;
    const watcher = chokidarWatch(checkoutPath, {
      usePolling,
      interval: 500,
    });

    const handleChange = (path: string, stats: Stats | undefined, eventType: 'add' | 'change' | 'unlink') => {
      const relPath = path.substring(checkoutPath.length + 1);
      if (!relPath) return;

      // Skip hidden files and common ignore patterns
      if (
        relPath.startsWith(".") ||
        relPath.includes("/.") ||
        relPath.includes("node_modules") ||
        relPath.includes("__pycache__") ||
        relPath.endsWith(".tmp") ||
        relPath.endsWith("~")
      ) {
        return;
      }

      const isNew = eventType === 'add';
      const deleted = eventType === 'unlink';

      const change: FileChange = {
        path: relPath,
        isNew,
        deleted,
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
      }, 100);
      this.changeTimeouts.set(sessionId, timeout);
    };

    watcher
      .on('add', (path, stats) => handleChange(path, stats, 'add'))
      .on('change', (path, stats) => handleChange(path, stats, 'change'))
      .on('unlink', (path) => handleChange(path, undefined, 'unlink'))
      .on('error', (error) => {
        logger.warn(`[mimo-agent] Chokidar error for session ${sessionId}:`, error);
      });

    const session = this.sessions.get(sessionId);
    if (session) {
      session.fileWatcher = watcher as unknown as FSWatcher;
    }
  }

  private flushPendingChanges(sessionId: string): void {
    const changes = this.pendingChanges.get(sessionId);
    if (!changes || changes.length === 0) return;

    // Clear the timeout
    this.changeTimeouts.delete(sessionId);

    // Deduplicate changes
    const uniqueChanges = new Map<string, FileChange>();
    for (const change of changes) {
      uniqueChanges.set(change.path, change);
    }

    this.callbacks.onFileChange(sessionId, Array.from(uniqueChanges.values()));

    // Sync to local dev mirror
    const session = this.sessions.get(sessionId);
    if (session?.localDevMirrorPath) {
      this.syncToMirror(
        sessionId,
        session.checkoutPath,
        session.localDevMirrorPath,
        Array.from(uniqueChanges.values()),
      );
      // Only clear changes after they've been synced to mirror
      this.pendingChanges.set(sessionId, []);
    }
    // If localDevMirrorPath is not set, keep changes in pendingChanges
    // They will be flushed when setSessionLocalDevMirrorPath is called
  }

  private syncToMirror(
    sessionId: string,
    checkoutPath: string,
    mirrorPath: string,
    changes: FileChange[],
  ): void {
    if (!mirrorPath) return;

    for (const change of changes) {
      try {
        // Skip VCS metadata (directories and files)
        if (
          change.path.includes(".git/") ||
          change.path.includes(".fossil/") ||
          change.path.startsWith(".git") ||
          change.path.startsWith(".fossil") ||
          change.path === ".fslckout" ||
          change.path === "_FOSSIL_" ||
          change.path.endsWith("/.fslckout") ||
          change.path.endsWith("/_FOSSIL_") ||
          change.path === ".fslckout-journal"
        ) {
          continue;
        }

        const srcPath = join(checkoutPath, change.path);
        const destPath = join(mirrorPath, change.path);

        if (change.deleted) {
          // Remove from mirror
          if (existsSync(destPath)) {
            try {
              unlinkSync(destPath);
            } catch (err) {
              logger.warn(`[mimo-agent] Failed to delete ${destPath}:`, err);
            }
          }
        } else if (existsSync(srcPath)) {
          // Skip directories - only sync files
          if (statSync(srcPath).isDirectory()) {
            continue;
          }

          // Ensure parent directory exists
          const destDir = dirname(destPath);
          if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true });
          }

          // Copy file content
          const content = readFileSync(srcPath);
          writeFileSync(destPath, content);
        }
      } catch (err) {
        logger.warn(
          `[mimo-agent] Failed to sync ${change.path} to mirror:`,
          err,
        );
      }
    }
  }

  terminateSession(sessionId: string): void {
    this.stopSession(sessionId);
    this.sessions.delete(sessionId);
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

  terminateAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.terminateSession(sessionId);
    }
  }
}
