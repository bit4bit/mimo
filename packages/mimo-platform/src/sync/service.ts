import { join, relative, dirname, resolve } from "path";
import { existsSync, copyFileSync, mkdirSync, statSync, readFileSync, readdirSync, unlinkSync } from "fs";
import crypto from "crypto";
import { logger } from "../logger.js";
import type { SccService } from "../impact/scc-service.js";

export type FileStatus =
  | "clean"      // File hasn't changed
  | "modified"   // File modified by agent [M]
  | "new"        // New file created by agent [?]
  | "deleted"    // File deleted by agent [D]
  | "conflict";  // Conflict with original repo [!]

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
  baselineChecksums: Map<string, string>; // Track original checksums at last sync
  lastSyncAt?: Date;
}

export interface FileSyncServiceDeps {
  sessionRepository: typeof sessionRepository;
  sccService: typeof sccService;
}

export class FileSyncService {
  constructor(private deps: FileSyncServiceDeps) {}
  private syncStates: Map<string, FileSyncState> = new Map();
  private pendingChanges: Map<string, FileChange[]> = new Map(); // Buffered changes for reconnects
  private impactStaleHandler?: (sessionId: string) => void;

  setImpactStaleHandler(handler: (sessionId: string) => void): void {
    this.impactStaleHandler = handler;
  }

  async initializeSession(
    sessionId: string,
    agentWorkspacePath: string,
    upstreamPath?: string
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
      baselineChecksums: new Map(),
    };

    this.syncStates.set(sessionId, syncState);
    
    // Initialize empty pending changes buffer
    this.pendingChanges.set(sessionId, []);

    // Scan current state
    await this.scanSessionCheckout(sessionId);
  }

  async handleFileChanges(
    sessionId: string, 
    changes: Array<{ path: string; isNew?: boolean; deleted?: boolean }>
  ): Promise<FileChange[]> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) {
      await this.initializeSession(sessionId, "", "");
    }

    const fileChanges: FileChange[] = [];

    for (const change of changes) {
      let status: FileStatus = "modified";
      
      if (change.deleted) {
        status = "deleted";
      } else if (change.isNew) {
        status = "new";
      } else {
        // Check if file exists in original repo
        const originalPath = join(syncState!.upstreamPath, change.path);
        const sessionPath = join(syncState!.agentWorkspacePath, change.path);
        
        if (!existsSync(originalPath) && existsSync(sessionPath)) {
          status = "new";
        }
      }

      // Check for conflicts
      const conflictStatus = await this.checkConflict(
        sessionId, 
        change.path, 
        status
      );

      const fileChange: FileChange = {
        path: change.path,
        status: conflictStatus || status,
        timestamp: new Date(),
        ...(status !== "deleted" && await this.getFileInfo(sessionId, change.path)),
      };

      syncState!.changes.set(change.path, fileChange);
      fileChanges.push(fileChange);
    }

    // Sync changes to original repo
    await this.syncChangesToUpstream(sessionId, fileChanges);

    // Invalidate SCC cache when there are real changes
    if (fileChanges.length > 0 && syncState) {
      this.deps.sccService.invalidateCache(syncState.agentWorkspacePath);
      this.impactStaleHandler?.(sessionId);
    }

    return fileChanges;
  }

  private async checkConflict(
    sessionId: string,
    filePath: string,
    agentStatus: FileStatus
  ): Promise<FileStatus | null> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) return null;

    // Skip conflict check for new files
    if (agentStatus === "new") return null;

    const originalPath = join(syncState.upstreamPath, filePath);
    
    // If file doesn't exist in original, no conflict
    if (!existsSync(originalPath)) {
      return null;
    }

    // Get checksums
    const sessionPath = join(syncState.agentWorkspacePath, filePath);
    
    if (!existsSync(sessionPath)) {
      // File was deleted in session but exists in original
      // Check if original was modified since last sync
      const originalChecksum = await this.calculateChecksum(originalPath);
      const baselineChecksum = syncState.baselineChecksums.get(filePath);
      
      if (baselineChecksum && originalChecksum !== baselineChecksum) {
        return "conflict";
      }
      return null;
    }

    // Compare checksums
    const originalChecksum = await this.calculateChecksum(originalPath);
    const sessionChecksum = await this.calculateChecksum(sessionPath);
    const baselineChecksum = syncState.baselineChecksums.get(filePath);

    // If original changed since last sync and agent also changed it, it's a conflict
    if (baselineChecksum && 
        originalChecksum !== baselineChecksum && 
        sessionChecksum !== baselineChecksum) {
      return "conflict";
    }

    return null;
  }

  private async syncChangesToUpstream(
    sessionId: string, 
    changes: FileChange[]
  ): Promise<void> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) return;

    for (const change of changes) {
      if (change.status === "conflict") {
        // Don't sync conflicts - require manual resolution
        continue;
      }

      const sessionPath = join(syncState.agentWorkspacePath, change.path);
      const originalPath = join(syncState.upstreamPath, change.path);

      try {
        if (change.status === "deleted") {
          if (existsSync(originalPath)) {
            unlinkSync(originalPath);
          }
          // Remove from baseline
          syncState.baselineChecksums.delete(change.path);
        } else if (change.status === "new" || change.status === "modified") {
          // Ensure directory exists
          const originalDir = dirname(originalPath);
          if (!existsSync(originalDir)) {
            mkdirSync(originalDir, { recursive: true });
          }

          // Copy file with permissions
          if (existsSync(sessionPath)) {
            copyFileSync(sessionPath, originalPath);
            
            // Preserve timestamps if available
            if (change.lastModified) {
              const fs = require("fs");
              fs.utimesSync(originalPath, change.lastModified, change.lastModified);
            }
            
            // Update baseline checksum
            const newChecksum = await this.calculateChecksum(sessionPath);
            syncState.baselineChecksums.set(change.path, newChecksum);
          }
        }
      } catch (error) {
        logger.error(`Failed to sync ${change.path}:`, error);
      }
    }

    // Update last sync time
    syncState.lastSyncAt = new Date();
  }

  async manualPullFromOriginal(sessionId: string): Promise<FileChange[]> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) {
      throw new Error(`Session ${sessionId} not initialized`);
    }

    const changes: FileChange[] = [];

    // Scan original repo for changes
    await this.scanDirectory(
      syncState.upstreamPath,
      syncState.upstreamPath,
      async (originalPath, relativePath) => {
        const sessionPath = join(syncState.agentWorkspacePath, relativePath);
        
        // Check if file exists in session
        if (!existsSync(sessionPath)) {
          // File exists in original but not in session - copy it
          const sessionDir = dirname(sessionPath);
          if (!existsSync(sessionDir)) {
            mkdirSync(sessionDir, { recursive: true });
          }
          
          copyFileSync(originalPath, sessionPath);
          
          const fileChange: FileChange = {
            path: relativePath,
            status: "modified",
            timestamp: new Date(),
            ...await this.getFileInfo(sessionId, relativePath),
          };
          
          syncState.changes.set(relativePath, fileChange);
          changes.push(fileChange);
        } else {
          // File exists in both - check if different
          const originalChecksum = await this.calculateChecksum(originalPath);
          const sessionChecksum = await this.calculateChecksum(sessionPath);
          const baselineChecksum = syncState.baselineChecksums.get(relativePath);
          
          if (originalChecksum !== sessionChecksum) {
            // Check if session file is modified by agent (differs from baseline)
            const sessionModified = baselineChecksum && sessionChecksum !== baselineChecksum;
            // Check if original file is modified
            const originalModified = baselineChecksum && originalChecksum !== baselineChecksum;
            
            if (sessionModified && originalModified) {
              // Conflict! Both changed
              const conflictChange: FileChange = {
                path: relativePath,
                status: "conflict",
                timestamp: new Date(),
              };
              
              syncState.changes.set(relativePath, conflictChange);
              changes.push(conflictChange);
            } else {
              // Only original changed or only session changed (not both)
              // Copy from original to session
              copyFileSync(originalPath, sessionPath);
              
              // Update baseline
              syncState.baselineChecksums.set(relativePath, originalChecksum);
              
              const fileChange: FileChange = {
                path: relativePath,
                status: "modified",
                timestamp: new Date(),
                ...await this.getFileInfo(sessionId, relativePath),
              };
              
              syncState.changes.set(relativePath, fileChange);
              changes.push(fileChange);
            }
          }
        }
      }
    );

    syncState.lastSyncAt = new Date();
    return changes;
  }

  async resolveConflict(
    sessionId: string,
    filePath: string,
    resolution: "session" | "original" | "merge"
  ): Promise<void> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) {
      throw new Error(`Session ${sessionId} not initialized`);
    }

    const sessionPath = join(syncState.agentWorkspacePath, filePath);
    const originalPath = join(syncState.upstreamPath, filePath);

    if (resolution === "session") {
      // Keep session version
      if (existsSync(sessionPath)) {
        const originalDir = dirname(originalPath);
        if (!existsSync(originalDir)) {
          mkdirSync(originalDir, { recursive: true });
        }
        copyFileSync(sessionPath, originalPath);
      }
    } else if (resolution === "original") {
      // Keep original version
      if (existsSync(originalPath)) {
        const sessionDir = dirname(sessionPath);
        if (!existsSync(sessionDir)) {
          mkdirSync(sessionDir, { recursive: true });
        }
        copyFileSync(originalPath, sessionPath);
      }
    }
    // "merge" would require a merge tool - not implemented yet

    // Update status to clean (no longer conflicting)
    const fileChange: FileChange = {
      path: filePath,
      status: "clean",
      timestamp: new Date(),
      ...await this.getFileInfo(sessionId, filePath),
    };

    syncState.changes.set(filePath, fileChange);
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
    const hasConflicts = files.some(f => f.status === "conflict");

    return {
      sessionId,
      files: files.filter(f => f.status !== "clean"),
      hasConflicts,
      syncedAt: syncState.lastSyncAt,
    };
  }

  async getFileStatus(sessionId: string, filePath: string): Promise<FileStatus> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) return "clean";

    const change = syncState.changes.get(filePath);
    return change?.status || "clean";
  }

  async scanSessionCheckout(sessionId: string): Promise<void> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) return;

    // First scan the original repo to establish baseline
    await this.scanDirectory(
      syncState.upstreamPath,
      syncState.upstreamPath,
      async (fullPath, relativePath) => {
        const checksum = await this.calculateChecksum(fullPath);
        syncState.baselineChecksums.set(relativePath, checksum);
      }
    );

    // Then scan session worktree
    await this.scanDirectory(
      syncState.agentWorkspacePath,
      syncState.agentWorkspacePath,
      async (fullPath, relativePath) => {
        const fileChange: FileChange = {
          path: relativePath,
          status: "clean",
          timestamp: new Date(),
          ...await this.getFileInfo(sessionId, relativePath),
        };

        syncState.changes.set(relativePath, fileChange);
      }
    );
  }

  private async scanDirectory(
    dirPath: string,
    basePath: string,
    callback: (fullPath: string, relativePath: string) => Promise<void>
  ): Promise<void> {
    if (!existsSync(dirPath)) return;

    const entries = readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = relative(basePath, fullPath);

      // Skip hidden files and directories
      if (entry.name.startsWith(".")) continue;

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, basePath, callback);
      } else {
        await callback(fullPath, relativePath);
      }
    }
  }

  private async getFileInfo(sessionId: string, filePath: string): Promise<Partial<FileChange>> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) return {};

    const sessionPath = join(syncState.agentWorkspacePath, filePath);
    
    if (!existsSync(sessionPath)) {
      return {};
    }

    const stats = statSync(sessionPath);
    const checksum = await this.calculateChecksum(sessionPath);

    return {
      size: stats.size,
      lastModified: stats.mtime,
      checksum,
    };
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const content = readFileSync(filePath);
    return crypto.createHash("md5").update(content).digest("hex");
  }

  async bufferChangesForReconnect(
    sessionId: string, 
    changes: FileChange[]
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
