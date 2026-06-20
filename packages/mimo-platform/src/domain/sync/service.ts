// SPDX-License-Identifier: AGPL-3.0-only
import crypto from "crypto";
import type { SccService } from "../impact/scc-service.js";
import { isExcluded } from "../files/path-policy.js";
import type { OS } from "../../infrastructure/os/types.js";

export type FileStatus =
  | "clean" // File hasn't changed
  | "modified" // File modified by agent [M]
  | "new" // New file created by agent [?]
  | "deleted" // File deleted by agent [D]
  | "conflict"; // Conflict with original repo [!]

export interface FileChange {
  path: string;
  status: FileStatus;
  timestamp: Date;
  checksum?: string;
  size?: number;
  lastModified?: Date;
}

export interface ChangeSet {
  sessionId: string;
  files: FileChange[];
  syncedAt?: Date;
  hasConflicts: boolean;
}

export interface FileSyncState {
  sessionId: string;
  upstreamPath: string;
  agentWorkspacePath: string;
  changes: Map<string, FileChange>;
  lastSyncAt?: Date;
}

export interface FileSyncServiceDeps {
  sessionRepository: typeof sessionRepository;
  sccService: typeof sccService;
  os: OS;
}

export class FileSyncService {
  private os: OS;
  constructor(private deps: FileSyncServiceDeps) {
    this.os = deps.os;
  }
  private syncStates: Map<string, FileSyncState> = new Map();
  private pendingChanges: Map<string, FileChange[]> = new Map(); // Buffered changes for reconnects
  private impactStaleHandler?: (sessionId: string) => void;

  setImpactStaleHandler(handler: (sessionId: string) => void): void {
    this.impactStaleHandler = handler;
  }

  async initializeSession(
    sessionId: string,
    agentWorkspacePath: string,
    upstreamPath?: string,
  ): Promise<void> {
    // Get paths from session if not provided
    if (!upstreamPath || !agentWorkspacePath) {
      const session = await this.deps.sessionRepository.findById(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      upstreamPath = upstreamPath || session.upstreamPath;
      agentWorkspacePath = agentWorkspacePath || session.agentWorkspacePath;
    }

    const syncState: FileSyncState = {
      sessionId,
      upstreamPath,
      agentWorkspacePath,
      changes: new Map(),
    };

    this.syncStates.set(sessionId, syncState);

    // Initialize empty pending changes buffer
    this.pendingChanges.set(sessionId, []);

    // Scan current state
    await this.scanSessionCheckout(sessionId);
  }

  async handleFileChanges(
    sessionId: string,
    changes: Array<{ path: string; isNew?: boolean; deleted?: boolean }>,
  ): Promise<FileChange[]> {
    let syncState = this.syncStates.get(sessionId);
    if (!syncState) {
      await this.initializeSession(sessionId, "", "");
      syncState = this.syncStates.get(sessionId);
    }
    if (!syncState) {
      return [];
    }

    const fileChanges: FileChange[] = [];

    for (const change of changes) {
      let status: FileStatus = "modified";

      if (change.deleted) {
        status = "deleted";
      } else if (change.isNew) {
        status = "new";
      } else {
        // New file if it exists in the agent workspace but not in the
        // upstream baseline.
        const baselinePath = this.os.path.join(
          syncState.upstreamPath,
          change.path,
        );
        const workspacePath = this.os.path.join(
          syncState.agentWorkspacePath,
          change.path,
        );

        if (
          !this.os.fs.exists(baselinePath) &&
          this.os.fs.exists(workspacePath)
        ) {
          status = "new";
        }
      }

      const fileChange: FileChange = {
        path: change.path,
        status,
        timestamp: new Date(),
        ...(status !== "deleted" &&
          (await this.getFileInfo(sessionId, change.path))),
      };

      syncState.changes.set(change.path, fileChange);
      fileChanges.push(fileChange);
    }

    // upstream/ is the committed baseline (it carries the external `origin`
    // remote) and must NOT be mutated here. Agent changes are published
    // explicitly via CommitService.commitAndPushSelective. We only refresh
    // derived state so the UI reflects the new agent-workspace content.
    if (fileChanges.length > 0) {
      this.deps.sccService.invalidateCache(syncState.agentWorkspacePath);
      this.impactStaleHandler?.(sessionId);
    }

    return fileChanges;
  }

  async getChangeSet(sessionId: string): Promise<ChangeSet> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) {
      return {
        sessionId,
        files: [],
        hasConflicts: false,
      };
    }

    const files = Array.from(syncState.changes.values());
    const hasConflicts = files.some((f) => f.status === "conflict");

    return {
      sessionId,
      files: files.filter((f) => f.status !== "clean"),
      hasConflicts,
      syncedAt: syncState.lastSyncAt,
    };
  }

  async getFileStatus(
    sessionId: string,
    filePath: string,
  ): Promise<FileStatus> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) return "clean";

    const change = syncState.changes.get(filePath);
    return change?.status || "clean";
  }

  async scanSessionCheckout(sessionId: string): Promise<void> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) return;

    // Scan the agent workspace and seed every file as clean. upstream/ is the
    // committed baseline and is never mutated here, so there is no baseline to
    // track for live diffing — change detection happens on demand via
    // detectChangedFiles(upstreamPath, agentWorkspacePath).
    await this.scanDirectory(
      syncState.agentWorkspacePath,
      syncState.agentWorkspacePath,
      async (fullPath, relativePath) => {
        const fileChange: FileChange = {
          path: relativePath,
          status: "clean",
          timestamp: new Date(),
          ...(await this.getFileInfo(sessionId, relativePath)),
        };

        syncState.changes.set(relativePath, fileChange);
      },
    );
  }

  private async scanDirectory(
    dirPath: string,
    basePath: string,
    callback: (fullPath: string, relativePath: string) => Promise<void>,
  ): Promise<void> {
    if (!this.os.fs.exists(dirPath)) return;

    const entries = this.os.fs.readdir(dirPath, {
      withFileTypes: true,
    }) as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;

    for (const entry of entries) {
      const fullPath = this.os.path.join(dirPath, entry.name);
      const relativePath = this.os.path.relative(basePath, fullPath);

      if (isExcluded(entry.name)) continue;

      const entryStats = this.os.fs.lstat(fullPath);
      if (entryStats.isDirectory()) {
        await this.scanDirectory(fullPath, basePath, callback);
      } else if (entryStats.isFile()) {
        await callback(fullPath, relativePath);
      }
    }
  }

  private async getFileInfo(
    sessionId: string,
    filePath: string,
  ): Promise<Partial<FileChange>> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) return {};

    const sessionPath = this.os.path.join(
      syncState.agentWorkspacePath,
      filePath,
    );

    if (!this.os.fs.exists(sessionPath)) {
      return {};
    }

    const stats = this.os.fs.lstat(sessionPath);
    if (!stats.isFile()) {
      return {};
    }

    const checksum = await this.calculateChecksum(sessionPath);

    return {
      size: stats.size,
      lastModified: stats.mtime as Date,
      checksum,
    };
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const stats = this.os.fs.stat(filePath);
    if (stats.isDirectory()) {
      throw new Error(`Cannot calculate checksum for directory: ${filePath}`);
    }
    const content = this.os.fs.readFile(filePath);
    return crypto.createHash("md5").update(content).digest("hex");
  }

  async bufferChangesForReconnect(
    sessionId: string,
    changes: FileChange[],
  ): Promise<void> {
    const buffered = this.pendingChanges.get(sessionId) || [];
    this.pendingChanges.set(sessionId, [...buffered, ...changes]);
  }

  async getBufferedChanges(sessionId: string): Promise<FileChange[]> {
    return this.pendingChanges.get(sessionId) || [];
  }

  async clearBufferedChanges(sessionId: string): Promise<void> {
    this.pendingChanges.delete(sessionId);
  }

  async cleanupSession(sessionId: string): Promise<void> {
    this.syncStates.delete(sessionId);
    this.pendingChanges.delete(sessionId);
  }
}

// Singleton instance for backward compatibility with existing tests
// This is a mock instance used by sync.test.ts
const mockSccService = {
  invalidateCache: () => {},
};

export const fileSyncService = new FileSyncService({
  sessionRepository: {} as any,
  sccService: mockSccService as any,
  os: {} as any,
});
