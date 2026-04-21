import {
  SessionInfo,
  FileChange,
  ModelState,
  ModeState,
  McpServerConfig,
} from "./types";
import { logger } from "./logger.js";
import { resolve, join } from "node:path";
import {
  watch,
  existsSync,
  mkdirSync,
} from "node:fs";
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

  private startFileWatcher(sessionId: string, checkoutPath: string): void {
    logger.debug(`[mimo-agent] Starting file watcher for session ${sessionId}`);

    const watcher = watch(
      checkoutPath,
      { recursive: true },
      (eventType: string, filename: string | null) => {
        if (!filename) return;

        // Skip VCS internals and common ignore patterns
        const VCS_INTERNALS = new Set([".fossil", ".fslckout", ".fossil-settings", ".git"]);
        const firstSegment = filename.split("/")[0];
        if (
          VCS_INTERNALS.has(firstSegment) ||
          filename.includes("node_modules") ||
          filename.includes("__pycache__") ||
          filename.endsWith(".tmp") ||
          filename.endsWith("~")
        ) {
          return;
        }

        // Detect file creation vs deletion for rename events
        // Node.js fs.watch reports both as 'rename' event type
        const srcPath = join(checkoutPath, filename);
        const isRenameEvent = eventType === "rename";
        const fileExists = existsSync(srcPath);

        const change: FileChange = {
          path: filename,
          isNew: isRenameEvent && fileExists, // New file: rename event + file exists
          deleted: isRenameEvent && !fileExists, // Deleted: rename event + file missing
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
      },
    );

    const session = this.sessions.get(sessionId);
    if (session) {
      session.fileWatcher = watcher;
    }
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

  stopAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.stopSession(sessionId);
    }
  }

  terminateAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.terminateSession(sessionId);
    }
  }
}
