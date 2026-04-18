import { createHash } from "crypto";
import { readFileSync, existsSync, statSync } from "fs";
import { join, resolve } from "path";
import chokidar from "chokidar";

export interface FileWatcherService {
  /**
   * Start watching a file for the given session.
   * When the file changes on disk, the service computes a checksum
   * and notifies via callback if content differs.
   */
  watchFile(
    sessionId: string,
    filePath: string,
    currentChecksum: string,
    callback: (event: WatchEvent) => void
  ): Promise<void>;

  /**
   * Stop watching a specific file for a session.
   */
  unwatchFile(sessionId: string, filePath: string): void;

  /**
   * Stop watching all files for a session (cleanup).
   */
  unwatchAll(sessionId: string): void;

  /**
   * Check if a file is currently being watched for a session.
   */
  isWatching(sessionId: string, filePath: string): boolean;

  /**
   * Compute MD5 checksum of file content.
   */
  computeChecksum(filePath: string): Promise<string>;

  /**
   * Dispose all watchers (for cleanup).
   */
  dispose?(): void;
}

export interface WatchEvent {
  type: "file_outdated" | "file_deleted" | "file_changed";
  path: string;
  checksum?: string;
}

interface WatchedFile {
  filePath: string;
  sessionId: string;
  currentChecksum: string;
  callback: (event: WatchEvent) => void;
}

export function createFileWatcherService(): FileWatcherService {
  // Map of sessionId -> Map of filePath -> WatchedFile
  const watches = new Map<string, Map<string, WatchedFile>>();

  // Single chokidar watcher instance for all files
  let watcher: ReturnType<typeof chokidar.watch> | null = null;
  const watchedPaths = new Set<string>();

  // Debounce timers
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function ensureWatcher(): ReturnType<typeof chokidar.watch> {
    if (!watcher) {
      watcher = chokidar.watch([], {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100,
        },
      });

      watcher.on("change", (filePath) => {
        handleFileChange(filePath);
      });

      watcher.on("unlink", (filePath) => {
        handleFileDelete(filePath);
      });

      watcher.on("error", (error) => {
        console.error("[FileWatcher] Error:", error);
      });
    }
    return watcher;
  }

  function handleFileChange(filePath: string) {
    // Find all sessions watching this file and notify immediately
    for (const [sessionId, sessionWatches] of watches) {
      const watchedFile = sessionWatches.get(filePath);
      if (watchedFile) {
        // Schedule checksum verification
        setImmediate(async () => {
          try {
            const newChecksum = await computeChecksum(filePath);
            if (newChecksum !== watchedFile.currentChecksum) {
              watchedFile.callback({
                type: "file_outdated",
                path: filePath,
              });
              watchedFile.currentChecksum = newChecksum;
            }
          } catch (error) {
            watchedFile.callback({
              type: "file_deleted",
              path: filePath,
            });
          }
        });
      }
    }
  }

  async function handleFileDelete(filePath: string) {
    // Notify all sessions watching this file
    for (const [sessionId, sessionWatches] of watches) {
      const watchedFile = sessionWatches.get(filePath);
      if (watchedFile) {
        // Clear any pending debounce timer since file is deleted
        const existingTimer = debounceTimers.get(filePath);
        if (existingTimer) {
          clearTimeout(existingTimer);
          debounceTimers.delete(filePath);
        }
        
        watchedFile.callback({
          type: "file_deleted",
          path: filePath,
        });
        
        // Remove this file from the session watches since it's deleted
        sessionWatches.delete(filePath);
      }
    }
    
    // Clean up from watchedPaths
    watchedPaths.delete(filePath);
  }

  async function computeChecksum(filePath: string): Promise<string> {
    const resolvedPath = resolve(filePath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(resolvedPath);
    return createHash("md5").update(content).digest("hex");
  }

  async function watchFile(
    sessionId: string,
    filePath: string,
    currentChecksum: string,
    callback: (event: WatchEvent) => void
  ): Promise<void> {
    const resolvedPath = resolve(filePath);

    // Get or create session watches
    let sessionWatches = watches.get(sessionId);
    if (!sessionWatches) {
      sessionWatches = new Map();
      watches.set(sessionId, sessionWatches);
    }

    // Store watch info
    sessionWatches.set(resolvedPath, {
      filePath: resolvedPath,
      sessionId,
      currentChecksum,
      callback,
    });

    // Add to chokidar if not already watching
    if (!watchedPaths.has(resolvedPath)) {
      watchedPaths.add(resolvedPath);
      ensureWatcher().add(resolvedPath);
    }
  }

  function unwatchFile(sessionId: string, filePath: string): void {
    const resolvedPath = resolve(filePath);
    const sessionWatches = watches.get(sessionId);
    if (sessionWatches) {
      sessionWatches.delete(resolvedPath);

      // Clean up empty session
      if (sessionWatches.size === 0) {
        watches.delete(sessionId);
      }
    }

    // Check if any other session is still watching this file
    let stillWatched = false;
    for (const [, sessionWatches] of watches) {
      if (sessionWatches.has(resolvedPath)) {
        stillWatched = true;
        break;
      }
    }

    // Remove from chokidar if no longer watched
    if (!stillWatched && watcher) {
      watcher.unwatch(resolvedPath);
      watchedPaths.delete(resolvedPath);
    }
  }

  function unwatchAll(sessionId: string): void {
    const sessionWatches = watches.get(sessionId);
    if (!sessionWatches) return;

    for (const [filePath] of sessionWatches) {
      unwatchFile(sessionId, filePath);
    }

    watches.delete(sessionId);
  }

  function isWatching(sessionId: string, filePath: string): boolean {
    const resolvedPath = resolve(filePath);
    const sessionWatches = watches.get(sessionId);
    return sessionWatches?.has(resolvedPath) ?? false;
  }

  function dispose(): void {
    // Clear all debounce timers
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    debounceTimers.clear();

    // Close watcher
    if (watcher) {
      watcher.close();
      watcher = null;
    }

    // Clear all watches
    watches.clear();
    watchedPaths.clear();
  }

  return {
    watchFile,
    unwatchFile,
    unwatchAll,
    isWatching,
    computeChecksum,
    dispose,
  };
}
