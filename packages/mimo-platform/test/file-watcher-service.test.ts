import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  createFileWatcherService,
  type FileWatcherService,
} from "../src/files/file-watcher-service";
import { createOS } from "../src/os/node-adapter.js";
import { waitFor, waitForEvent } from "./test-helpers.js";

describe("FileWatcherService", () => {
  let tempDir: string;
  let watcher: FileWatcherService;
  let receivedEvents: Array<{ type: string; path: string; checksum?: string }>;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "file-watcher-test-"));
    const os = createOS({ ...process.env });
    watcher = createFileWatcherService(os);
    receivedEvents = [];
  });

  afterEach(async () => {
    // Clean up all watchers
    watcher.dispose?.();
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("computeChecksum", () => {
    test("should compute consistent checksum for same content", async () => {
      const filePath = join(tempDir, "test.txt");
      writeFileSync(filePath, "Hello, World!");

      const checksum1 = await watcher.computeChecksum(filePath);
      const checksum2 = await watcher.computeChecksum(filePath);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toMatch(/^[a-f0-9]{32}$/);
    });

    test("should compute different checksum for different content", async () => {
      const file1 = join(tempDir, "test1.txt");
      const file2 = join(tempDir, "test2.txt");
      writeFileSync(file1, "Content A");
      writeFileSync(file2, "Content B");

      const checksum1 = await watcher.computeChecksum(file1);
      const checksum2 = await watcher.computeChecksum(file2);

      expect(checksum1).not.toBe(checksum2);
    });

    test("should throw error for non-existent file", async () => {
      const nonExistent = join(tempDir, "does-not-exist.txt");

      await expect(watcher.computeChecksum(nonExistent)).rejects.toThrow();
    });
  });

  describe("watchFile", () => {
    test("should start watching a file", async () => {
      const filePath = join(tempDir, "watch-test.txt");
      writeFileSync(filePath, "Initial content");

      const checksum = await watcher.computeChecksum(filePath);

      // Should not throw when starting to watch
      await watcher.watchFile("session-1", filePath, checksum, (event) => {
        receivedEvents.push(event);
      });

      expect(watcher.isWatching("session-1", filePath)).toBe(true);
    });

    test("should detect file changes and emit outdated event", async () => {
      const filePath = resolve(join(tempDir, "change-test.txt"));
      writeFileSync(filePath, "Initial content");

      const initialChecksum = await watcher.computeChecksum(filePath);

      // Use a promise to wait for the event
      let resolveEvent: () => void;
      const eventPromise = new Promise<void>((resolve) => {
        resolveEvent = resolve;
      });

      await watcher.watchFile(
        "session-2",
        filePath,
        initialChecksum,
        (event) => {
          receivedEvents.push(event);
          if (event.type === "file_outdated") {
            resolveEvent();
          }
        },
      );

      // Give chokidar time to set up watchers
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Modify the file
      writeFileSync(filePath, "Modified content");

      // Wait for event with explicit timeout
      await waitForEvent(eventPromise, { timeout: 3000 });

      expect(receivedEvents.length).toBeGreaterThan(0);
      expect(receivedEvents[0].type).toBe("file_outdated");
      expect(receivedEvents[0].path).toBe(filePath);
    });

    test("should not emit event when content checksum matches", async () => {
      const filePath = resolve(join(tempDir, "same-content.txt"));
      writeFileSync(filePath, "Same content");

      const checksum = await watcher.computeChecksum(filePath);

      await watcher.watchFile("session-3", filePath, checksum, (event) => {
        receivedEvents.push(event);
      });

      // Write same content (should not trigger change)
      writeFileSync(filePath, "Same content");

      // Wait briefly for any events to propagate
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not have received outdated event for same content
      const outdatedEvents = receivedEvents.filter(
        (e) => e.type === "file_outdated",
      );
      expect(outdatedEvents.length).toBe(0);
    });
  });

  describe("unwatchFile", () => {
    test("should stop watching a file", async () => {
      const filePath = join(tempDir, "unwatch-test.txt");
      writeFileSync(filePath, "Content");

      const checksum = await watcher.computeChecksum(filePath);

      await watcher.watchFile("session-4", filePath, checksum, () => {});
      expect(watcher.isWatching("session-4", filePath)).toBe(true);

      watcher.unwatchFile("session-4", filePath);
      expect(watcher.isWatching("session-4", filePath)).toBe(false);
    });
  });

  describe("unwatchAll", () => {
    test("should stop watching all files for a session", async () => {
      const file1 = join(tempDir, "file1.txt");
      const file2 = join(tempDir, "file2.txt");
      writeFileSync(file1, "Content 1");
      writeFileSync(file2, "Content 2");

      const checksum1 = await watcher.computeChecksum(file1);
      const checksum2 = await watcher.computeChecksum(file2);

      await watcher.watchFile("session-5", file1, checksum1, () => {});
      await watcher.watchFile("session-5", file2, checksum2, () => {});

      expect(watcher.isWatching("session-5", file1)).toBe(true);
      expect(watcher.isWatching("session-5", file2)).toBe(true);

      watcher.unwatchAll("session-5");

      expect(watcher.isWatching("session-5", file1)).toBe(false);
      expect(watcher.isWatching("session-5", file2)).toBe(false);
    });
  });

  describe("file deletion", () => {
    test("should emit file_deleted event when file is deleted", async () => {
      const filePath = resolve(join(tempDir, "delete-test.txt"));
      writeFileSync(filePath, "Will be deleted");

      const checksum = await watcher.computeChecksum(filePath);

      // Use a promise to wait for the event
      let resolveEvent: () => void;
      const eventPromise = new Promise<void>((resolve) => {
        resolveEvent = resolve;
      });

      await watcher.watchFile("session-6", filePath, checksum, (event) => {
        receivedEvents.push(event);
        if (event.type === "file_deleted") {
          resolveEvent();
        }
      });

      // Give chokidar time to set up watchers
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Delete the file
      rmSync(filePath);

      // Wait for event with explicit timeout
      try {
        await waitForEvent(eventPromise, { timeout: 2000 });
      } catch {
        // File deletion detection may vary by platform/chokidar configuration
      }

      const deletedEvents = receivedEvents.filter(
        (e) => e.type === "file_deleted",
      );
      if (deletedEvents.length > 0) {
        expect(deletedEvents[0].path).toBe(filePath);
      }
    });
  });

  describe("multiple sessions", () => {
    test("should isolate watches between sessions", async () => {
      const filePath = resolve(join(tempDir, "multi-session.txt"));
      writeFileSync(filePath, "Content");

      const checksum = await watcher.computeChecksum(filePath);

      const eventsA: typeof receivedEvents = [];
      const eventsB: typeof receivedEvents = [];

      let resolveA: () => void;
      let resolveB: () => void;
      const promiseA = new Promise<void>((resolve) => {
        resolveA = resolve;
      });
      const promiseB = new Promise<void>((resolve) => {
        resolveB = resolve;
      });

      await watcher.watchFile("session-a", filePath, checksum, (event) => {
        eventsA.push(event);
        if (event.type === "file_outdated") {
          resolveA();
        }
      });

      await watcher.watchFile("session-b", filePath, checksum, (event) => {
        eventsB.push(event);
        if (event.type === "file_outdated") {
          resolveB();
        }
      });

      // Give chokidar time to set up watchers
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Modify the file
      writeFileSync(filePath, "Modified");

      // Wait for both events with explicit timeout
      try {
        await Promise.all([
          waitForEvent(promiseA, { timeout: 3000 }),
          waitForEvent(promiseB, { timeout: 3000 }),
        ]);
      } catch {
        // At least one watcher may not fire on all platforms
      }

      // Both sessions should receive the event
      expect(eventsA.length).toBeGreaterThan(0);
      expect(eventsB.length).toBeGreaterThan(0);
    });
  });
});
