import { join, relative, dirname, resolve } from "path";
import { existsSync, copyFileSync, mkdirSync, statSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { getPaths } from "../config/paths.js";
import { sessionRepository } from "../sessions/repository.js";
import crypto from "crypto";

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
  originalRepoPath: string;
  sessionWorktreePath: string;
  changes: Map<string, FileChange>;
  lastSyncAt?: Date;
}

export class FileSyncService {
  private syncStates: Map<string, FileSyncState> = new Map();
  private pendingChanges: Map<string, FileChange[]> = new Map(); // Buffered changes for reconnects

  async initializeSession(
    sessionId: string,
    sessionWorktreePath: string,
    originalRepoPath?: string
  ): Promise<void> {
    // Get original repo path from session if not provided
    if (!originalRepoPath) {
      const session = await sessionRepository.findById(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Original repo is stored in the project's worktrees directory
      const { getProjectPath } = await import("../config/paths.js");
      const projectPath = getProjectPath(session.projectId);
      originalRepoPath = join(projectPath, "original");
    }

    const syncState: FileSyncState = {
      sessionId,
      originalRepoPath,
      sessionWorktreePath,
      changes: new Map(),
    };

    this.syncStates.set(sessionId, syncState);
    
    // Initialize empty pending changes buffer
    this.pendingChanges.set(sessionId, []);

    // Scan current state
    await this.scanSessionWorktree(sessionId);
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
        const originalPath = join(syncState!.originalRepoPath, change.path);
        const sessionPath = join(syncState!.sessionWorktreePath, change.path);
        
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
    await this.syncChangesToOriginal(sessionId, fileChanges);

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

    const originalPath = join(syncState.originalRepoPath, filePath);
    
    // If file doesn't exist in original, no conflict
    if (!existsSync(originalPath)) {
      return null;
    }

    // Get checksums
    const sessionPath = join(syncState.sessionWorktreePath, filePath);
    
    if (!existsSync(sessionPath)) {
      // File was deleted in session but exists in original
      // Check if original was modified since last sync
      const originalChecksum = await this.calculateChecksum(originalPath);
      const lastSyncChecksum = syncState.changes.get(filePath)?.checksum;
      
      if (lastSyncChecksum && originalChecksum !== lastSyncChecksum) {
        return "conflict";
      }
      return null;
    }

    // Compare checksums
    const originalChecksum = await this.calculateChecksum(originalPath);
    const sessionChecksum = await this.calculateChecksum(sessionPath);
    const lastSyncChecksum = syncState.changes.get(filePath)?.checksum;

    // If original changed since last sync and agent also changed it, it's a conflict
    if (lastSyncChecksum && 
        originalChecksum !== lastSyncChecksum && 
        sessionChecksum !== lastSyncChecksum) {
      return "conflict";
    }

    return null;
  }

  private async syncChangesToOriginal(
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

      const sessionPath = join(syncState.sessionWorktreePath, change.path);
      const originalPath = join(syncState.originalRepoPath, change.path);

      try {
        if (change.status === "deleted") {
          if (existsSync(originalPath)) {
            unlinkSync(originalPath);
          }
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
          }
        }
      } catch (error) {
        console.error(`Failed to sync ${change.path}:`, error);
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
      syncState.originalRepoPath,
      syncState.originalRepoPath,
      async (originalPath, relativePath) => {
        const sessionPath = join(syncState.sessionWorktreePath, relativePath);
        
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
          
          if (originalChecksum !== sessionChecksum) {
            // Check if session file is modified by agent
            const existingChange = syncState.changes.get(relativePath);
            
            if (existingChange?.status === "modified" || existingChange?.status === "new") {
              // Conflict! Both changed
              const conflictChange: FileChange = {
                path: relativePath,
                status: "conflict",
                timestamp: new Date(),
              };
              
              syncState.changes.set(relativePath, conflictChange);
              changes.push(conflictChange);
            } else {
              // Only original changed - copy to session
              copyFileSync(originalPath, sessionPath);
              
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

    const sessionPath = join(syncState.sessionWorktreePath, filePath);
    const originalPath = join(syncState.originalRepoPath, filePath);

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

  async scanSessionWorktree(sessionId: string): Promise<void> {
    const syncState = this.syncStates.get(sessionId);
    if (!syncState) return;

    await this.scanDirectory(
      syncState.sessionWorktreePath,
      syncState.sessionWorktreePath,
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

    const sessionPath = join(syncState.sessionWorktreePath, filePath);
    
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

export const fileSyncService = new FileSyncService();
