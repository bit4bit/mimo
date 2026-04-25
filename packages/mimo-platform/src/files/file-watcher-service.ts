import { createHash } from "crypto";
import chokidar from "chokidar";
import type { OS } from "../os/types.js";
import { logger } from "../logger";

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
    callback: (event: WatchEvent) => void,
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

export function createFileWatcherService(os: OS): FileWatcherService {
  // Map of sessionId -> Map of filePath -> WatchedFile
  const watches = new Map<string, Map<string, WatchedFile>>();

  // Single chokidar watcher instance for all files
  let watcher: ReturnType<typeof chokidar.watch> | null = null;
  const watchedPaths = new Set<string>();

  // Debounce timers
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function ensureWatcher(): ReturnType<typeof chokidar.watch> {
    if (!watcher) {
      logger.debug("[FileWatcher] Creating chokidar watcher...");
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
        logger.debug(`[FileWatcher] chokidar: add event for: ${filePath}`);
      });

      watcher.on("change", (filePath) => {
        logger.debug(`[FileWatcher] chokidar: change event for: ${filePath}`);
        handleFileChange(filePath);
      });

      watcher.on("unlink", (filePath) => {
        logger.debug(`[FileWatcher] chokidar: unlink event for: ${filePath}`);
        handleFileDelete(filePath);
      });

      watcher.on("ready", () => {
        logger.debug("[FileWatcher] chokidar is ready");
      });

      watcher.on("raw", (event, path) => {
        logger.debug(`[FileWatcher] chokidar raw: ${event} ${path}`);
      });

      watcher.on("error", (error) => {
        logger.error("[FileWatcher] Error:", error);
      });

      logger.debug("[FileWatcher] chokidar watcher created");
    }
    return watcher;
  }

  function isPatchFile(filePath: string): boolean {
    return (
      filePath.includes(".mimo-patches/") ||
      filePath.startsWith(".mimo-patches")
    );
  }

  function handleFileChange(filePath: string) {
    const resolvedPath = os.path.resolve(filePath);

    if (isPatchFile(resolvedPath)) return;

    logger.debug(`[FileWatcher] handleFileChange called for: ${resolvedPath}`);
    logger.debug(`[FileWatcher] Total sessions: ${watches.size}`);

    for (const [sessionId, sessionWatches] of watches) {
      logger.debug(
        `[FileWatcher] Checking session ${sessionId}, watches: ${sessionWatches.size}`,
      );
      const watchedFile = sessionWatches.get(resolvedPath);
      logger.debug(
        `[FileWatcher] Lookup result for ${resolvedPath}:`,
        watchedFile ? "found" : "not found",
      );

      if (!watchedFile) {
        logger.debug(`[FileWatcher] Available paths in session ${sessionId}:`, [
          ...sessionWatches.keys(),
        ]);
      }

      if (watchedFile) {
        logger.debug(`[FileWatcher] File matched, checking checksum`);
        setImmediate(async () => {
          try {
            const newChecksum = await computeChecksum(resolvedPath);
            logger.debug(
              `[FileWatcher] Checksums - current: ${watchedFile.currentChecksum}, new: ${newChecksum}`,
            );
            if (newChecksum !== watchedFile.currentChecksum) {
              logger.debug(
                `[FileWatcher] Checksums differ, calling callback with path: ${resolvedPath}`,
              );
              watchedFile.callback({
                type: "file_outdated",
                path: resolvedPath,
              });
              watchedFile.currentChecksum = newChecksum;
            } else {
              logger.debug(`[FileWatcher] Checksums match, no outdated event`);
            }
          } catch (error) {
            logger.debug(
              `[FileWatcher] Error computing checksum, sending file_deleted: ${error}`,
            );
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
    const resolvedPath = os.path.resolve(filePath);

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
    const resolvedPath = os.path.resolve(filePath);
    if (!os.fs.exists(resolvedPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = os.fs.readFile(resolvedPath);
    return createHash("md5").update(content).digest("hex");
  }

  async function watchFile(
    sessionId: string,
    filePath: string,
    currentChecksum: string,
    callback: (event: WatchEvent) => void,
  ): Promise<void> {
    const resolvedPath = os.path.resolve(filePath);
    logger.debug(`[FileWatcher] watchFile called for session ${sessionId}`);
    logger.debug(`[FileWatcher] filePath: ${filePath}`);
    logger.debug(`[FileWatcher] resolvedPath: ${resolvedPath}`);
    logger.debug(`[FileWatcher] currentChecksum: ${currentChecksum}`);

    // Get or create session watches
    let sessionWatches = watches.get(sessionId);
    if (!sessionWatches) {
      sessionWatches = new Map();
      watches.set(sessionId, sessionWatches);
      logger.debug(
        `[FileWatcher] Created new session watches for ${sessionId}`,
      );
    }

    // Store watch info
    sessionWatches.set(resolvedPath, {
      filePath: resolvedPath,
      sessionId,
      currentChecksum,
      callback,
    });
    logger.debug(`[FileWatcher] Stored watch for ${resolvedPath}`);
    logger.debug(
      `[FileWatcher] Session ${sessionId} now has ${sessionWatches.size} watches`,
    );

    // Add to chokidar if not already watching
    if (!watchedPaths.has(resolvedPath)) {
      watchedPaths.add(resolvedPath);
      logger.debug(`[FileWatcher] Adding ${resolvedPath} to chokidar`);
      ensureWatcher().add(resolvedPath);
      logger.debug(
        `[FileWatcher] chokidar now watching ${watchedPaths.size} paths`,
      );
    } else {
      logger.debug(
        `[FileWatcher] Path ${resolvedPath} already being watched by chokidar`,
      );
    }
  }

  function unwatchFile(sessionId: string, filePath: string): void {
    const resolvedPath = os.path.resolve(filePath);
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
    const resolvedPath = os.path.resolve(filePath);
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
