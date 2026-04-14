import { watch, existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { spawn } from "child_process";
import { SessionInfo, FileChange, ModelState, ModeState, McpServerConfig } from "./types";

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
    fossilPassword?: string
  ): Promise<SessionInfo> {
    const checkoutPath = join(this.workDir, sessionId);

    console.log(`[mimo-agent] Creating session ${sessionId}`);
    console.log(`[mimo-agent]   Fossil URL: ${fossilUrl}`);
    console.log(`[mimo-agent]   Checkout: ${checkoutPath}`);

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
    modeState?: ModeState
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

  setSessionLocalDevMirrorPath(sessionId: string, localDevMirrorPath: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.localDevMirrorPath = localDevMirrorPath;
    }
  }

  setSessionMcpServers(sessionId: string, mcpServers: McpServerConfig[]): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.mcpServers = mcpServers;
    }
  }

  private startFileWatcher(sessionId: string, checkoutPath: string): void {
    console.log(`[mimo-agent] Starting file watcher for session ${sessionId}`);

    const watcher = watch(
      checkoutPath,
      { recursive: true },
      (eventType: string, filename: string | null) => {
        if (!filename) return;

        // Skip hidden files and common ignore patterns
        if (
          filename.startsWith(".") ||
          filename.includes("/.") ||
          filename.includes("node_modules") ||
          filename.includes("__pycache__") ||
          filename.endsWith(".tmp") ||
          filename.endsWith("~")
        ) {
          return;
        }

        const change: FileChange = {
          path: filename,
          isNew: eventType === "rename",
          deleted: false,
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
      }
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

    this.callbacks.onFileChange(
      sessionId,
      Array.from(uniqueChanges.values())
    );

    // Sync to local dev mirror
    const session = this.sessions.get(sessionId);
    if (session?.localDevMirrorPath) {
      this.syncToMirror(sessionId, session.checkoutPath, session.localDevMirrorPath, Array.from(uniqueChanges.values()));
    }
  }

  private syncToMirror(sessionId: string, checkoutPath: string, mirrorPath: string, changes: FileChange[]): void {
    if (!mirrorPath) return;

    for (const change of changes) {
      try {
        // Skip VCS metadata (directories and files)
        if (change.path.includes(".git/") || change.path.includes(".fossil/") ||
            change.path.startsWith(".git") || change.path.startsWith(".fossil") ||
            change.path === ".fslckout" || change.path === "_FOSSIL_" ||
            change.path.endsWith("/.fslckout") || change.path.endsWith("/_FOSSIL_") ||
            change.path === ".fslckout-journal") {
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
              console.warn(`[mimo-agent] Failed to delete ${destPath}:`, err);
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
        console.warn(`[mimo-agent] Failed to sync ${change.path} to mirror:`, err);
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
      console.log(`[mimo-agent] Force-killing ACP process for ${sessionId}`);
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
