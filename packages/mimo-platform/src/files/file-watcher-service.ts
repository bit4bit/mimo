import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
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
      console.log("[FileWatcher] Creating chokidar watcher...");
      watcher = chokidar.watch([], {
        persistent: true,
        ignoreInitial: true,
        usePolling: true,
        interval: 200,
        binaryInterval: 300,
        ignorePermissionErrors: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
      });

      watcher.on("add", (filePath) => {
        console.log(`[FileWatcher] chokidar: add event for: ${filePath}`);
      });

      watcher.on("change", (filePath) => {
        console.log(`[FileWatcher] chokidar: change event for: ${filePath}`);
        handleFileChange(filePath);
      });

      watcher.on("unlink", (filePath) => {
        console.log(`[FileWatcher] chokidar: unlink event for: ${filePath}`);
        handleFileDelete(filePath);
      });

      watcher.on("ready", () => {
        console.log("[FileWatcher] chokidar is ready");
      });

      watcher.on("raw", (event, path) => {
        console.log(`[FileWatcher] chokidar raw: ${event} ${path}`);
      });

      watcher.on("error", (error) => {
        console.error("[FileWatcher] Error:", error);
      });

      console.log("[FileWatcher] chokidar watcher created");
    }
    return watcher;
  }

  function isPatchFile(filePath: string): boolean {
    return filePath.includes(".mimo-patches/") || filePath.startsWith(".mimo-patches");
  }

  function handleFileChange(filePath: string) {
    const resolvedPath = resolve(filePath);

    // Filter out patch files
    if (isPatchFile(resolvedPath)) return;

    console.log(`[FileWatcher] handleFileChange called for: ${resolvedPath}`);
    console.log(`[FileWatcher] Total sessions: ${watches.size}`);

    // Find all sessions watching this file and notify immediately
    for (const [sessionId, sessionWatches] of watches) {
      console.log(`[FileWatcher] Checking session ${sessionId}, watches: ${sessionWatches.size}`);
      const watchedFile = sessionWatches.get(resolvedPath);
      console.log(`[FileWatcher] Lookup result for ${resolvedPath}:`, watchedFile ? "found" : "not found");
      
      // Debug: log all watched paths in this session
      if (!watchedFile) {
        console.log(`[FileWatcher] Available paths in session ${sessionId}:`, [...sessionWatches.keys()]);
      }
      
      if (watchedFile) {
        console.log(`[FileWatcher] File matched, checking checksum`);
        // Schedule checksum verification
        setImmediate(async () => {
          try {
            const newChecksum = await computeChecksum(resolvedPath);
            console.log(`[FileWatcher] Checksums - current: ${watchedFile.currentChecksum}, new: ${newChecksum}`);
            if (newChecksum !== watchedFile.currentChecksum) {
              console.log(`[FileWatcher] Checksums differ, calling callback with path: ${resolvedPath}`);
              watchedFile.callback({
                type: "file_outdated",
                path: resolvedPath,
              });
              watchedFile.currentChecksum = newChecksum;
            } else {
              console.log(`[FileWatcher] Checksums match, no outdated event`);
            }
          } catch (error) {
            console.log(`[FileWatcher] Error computing checksum, sending file_deleted: ${error}`);
            watchedFile.callback({
              type: "file_deleted",
              path: resolvedPath,
            });
          }
        });
      }
    }
  }

  async function handleFileDelete(filePath: string) {
    const resolvedPath = resolve(filePath);

    // Filter out patch files
    if (isPatchFile(resolvedPath)) return;
    // Notify all sessions watching this file
    for (const [sessionId, sessionWatches] of watches) {
      const watchedFile = sessionWatches.get(resolvedPath);
      if (watchedFile) {
        // Clear any pending debounce timer since file is deleted
        const existingTimer = debounceTimers.get(resolvedPath);
        if (existingTimer) {
          clearTimeout(existingTimer);
          debounceTimers.delete(resolvedPath);
        }
        
        watchedFile.callback({
          type: "file_deleted",
          path: resolvedPath,
        });
        
        // Remove this file from the session watches since it's deleted
        sessionWatches.delete(resolvedPath);
      }
    }
    
    // Clean up from watchedPaths
    watchedPaths.delete(resolvedPath);
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
    console.log(`[FileWatcher] watchFile called for session ${sessionId}`);
    console.log(`[FileWatcher] filePath: ${filePath}`);
    console.log(`[FileWatcher] resolvedPath: ${resolvedPath}`);
    console.log(`[FileWatcher] currentChecksum: ${currentChecksum}`);

    // Get or create session watches
    let sessionWatches = watches.get(sessionId);
    if (!sessionWatches) {
      sessionWatches = new Map();
      watches.set(sessionId, sessionWatches);
      console.log(`[FileWatcher] Created new session watches for ${sessionId}`);
    }

    // Store watch info
    sessionWatches.set(resolvedPath, {
      filePath: resolvedPath,
      sessionId,
      currentChecksum,
      callback,
    });
    console.log(`[FileWatcher] Stored watch for ${resolvedPath}`);
    console.log(`[FileWatcher] Session ${sessionId} now has ${sessionWatches.size} watches`);

    // Add to chokidar if not already watching
    if (!watchedPaths.has(resolvedPath)) {
      watchedPaths.add(resolvedPath);
      console.log(`[FileWatcher] Adding ${resolvedPath} to chokidar`);
      ensureWatcher().add(resolvedPath);
      console.log(`[FileWatcher] chokidar now watching ${watchedPaths.size} paths`);
    } else {
      console.log(`[FileWatcher] Path ${resolvedPath} already being watched by chokidar`);
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
