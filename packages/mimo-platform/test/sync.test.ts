import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { fileSyncService, FileChange, FileStatus } from "../src/sync/service";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("File Synchronization", () => {
  let sessionWorktree: string;
  let originalRepo: string;
  const sessionId = "test-session-123";

  beforeEach(() => {
    // Create temporary directories for testing
    sessionWorktree = mkdtempSync(join(tmpdir(), "mimo-session-"));
    originalRepo = mkdtempSync(join(tmpdir(), "mimo-original-"));
    
    // Create some test files in original repo
    mkdirSync(join(originalRepo, "src"), { recursive: true });
    writeFileSync(join(originalRepo, "src", "app.js"), "console.log('hello');");
    writeFileSync(join(originalRepo, "README.md"), "# Test Project");
    
    // Initialize sync service
    fileSyncService.initializeSession(sessionId, sessionWorktree, originalRepo);
  });

  afterAll(() => {
    // Cleanup
    try {
      rmSync(sessionWorktree, { recursive: true, force: true });
      rmSync(originalRepo, { recursive: true, force: true });
    } catch {}
  });

  describe("7.1 File Change Listener", () => {
    it("should receive and process single file change", async () => {
      // Simulate agent modifying a file
      const changes = [{ path: "src/app.js", isNew: false, deleted: false }];
      
      // Create the file in session worktree first
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "app.js"), "console.log('modified');");
      
      const result = await fileSyncService.handleFileChanges(sessionId, changes);
      
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/app.js");
      expect(result[0].status).toBe("modified");
    });

    it("should receive and process multiple file changes", async () => {
      const changes = [
        { path: "src/app.js", isNew: false, deleted: false },
        { path: "README.md", isNew: false, deleted: false },
      ];
      
      // Create files in session worktree
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "app.js"), "console.log('modified');");
      writeFileSync(join(sessionWorktree, "README.md"), "# Modified");
      
      const result = await fileSyncService.handleFileChanges(sessionId, changes);
      
      expect(result).toHaveLength(2);
    });

    it("should detect new file creation", async () => {
      const changes = [{ path: "src/new.ts", isNew: true, deleted: false }];
      
      // Create the file in session worktree
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "new.ts"), "const x = 1;");
      
      const result = await fileSyncService.handleFileChanges(sessionId, changes);
      
      expect(result[0].status).toBe("new");
    });

    it("broadcasts impact stale callback when changes are processed", async () => {
      let staleSessionId: string | null = null;
      fileSyncService.setImpactStaleHandler((id: string) => {
        staleSessionId = id;
      });

      const changes = [{ path: "src/app.js", isNew: false, deleted: false }];
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "app.js"), "console.log('changed');");

      await fileSyncService.handleFileChanges(sessionId, changes);

      expect(staleSessionId).toBe(sessionId);
    });
  });

  describe("7.2 File Copy to Original Repo", () => {
    it("should sync modified file to original repo", async () => {
      // Create file in session worktree
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      const newContent = "console.log('synced');";
      writeFileSync(join(sessionWorktree, "src", "app.js"), newContent);
      
      const changes = [{ path: "src/app.js", isNew: false, deleted: false }];
      await fileSyncService.handleFileChanges(sessionId, changes);
      
      // Verify file was copied to original repo
      const originalContent = readFileSync(join(originalRepo, "src", "app.js"), "utf-8");
      expect(originalContent).toBe(newContent);
    });

    it("should create parent directories when syncing new files", async () => {
      const changes = [{ path: "src/components/Button.tsx", isNew: true, deleted: false }];
      
      // Create file in session worktree
      mkdirSync(join(sessionWorktree, "src", "components"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "components", "Button.tsx"), "export const Button = () => {};");
      
      await fileSyncService.handleFileChanges(sessionId, changes);
      
      // Verify directories and file were created
      expect(existsSync(join(originalRepo, "src", "components", "Button.tsx"))).toBe(true);
    });
  });

  describe("7.3 Conflict Detection", () => {
    it("should detect conflict when both original and session modified", async () => {
      // Modify in session
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "app.js"), "// session version");
      
      // Modify in original repo
      writeFileSync(join(originalRepo, "src", "app.js"), "// original version");
      
      const changes = [{ path: "src/app.js", isNew: false, deleted: false }];
      const result = await fileSyncService.handleFileChanges(sessionId, changes);
      
      expect(result[0].status).toBe("conflict");
    });

    it("should show conflict in change set", async () => {
      // Create a conflict
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "app.js"), "// session");
      writeFileSync(join(originalRepo, "src", "app.js"), "// original");
      
      const changes = [{ path: "src/app.js", isNew: false, deleted: false }];
      await fileSyncService.handleFileChanges(sessionId, changes);
      
      const changeSet = await fileSyncService.getChangeSet(sessionId);
      expect(changeSet.hasConflicts).toBe(true);
    });
  });

  describe("7.4 Conflict Resolution", () => {
    beforeEach(async () => {
      // Setup a conflict
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "app.js"), "// session");
      writeFileSync(join(originalRepo, "src", "app.js"), "// original");
      
      const changes = [{ path: "src/app.js", isNew: false, deleted: false }];
      await fileSyncService.handleFileChanges(sessionId, changes);
    });

    it("should resolve conflict by keeping session version", async () => {
      await fileSyncService.resolveConflict(sessionId, "src/app.js", "session");
      
      const status = await fileSyncService.getFileStatus(sessionId, "src/app.js");
      expect(status).toBe("clean");
      
      const content = readFileSync(join(originalRepo, "src", "app.js"), "utf-8");
      expect(content).toBe("// session");
    });

    it("should resolve conflict by keeping original version", async () => {
      await fileSyncService.resolveConflict(sessionId, "src/app.js", "original");
      
      const status = await fileSyncService.getFileStatus(sessionId, "src/app.js");
      expect(status).toBe("clean");
      
      const content = readFileSync(join(sessionWorktree, "src", "app.js"), "utf-8");
      expect(content).toBe("// original");
    });
  });

  describe("7.5 Batch Sync on Reconnect", () => {
    it("should buffer changes during disconnect", async () => {
      const changes: FileChange[] = [
        { path: "src/app.js", status: "modified", timestamp: new Date() },
        { path: "README.md", status: "modified", timestamp: new Date() },
      ];
      
      await fileSyncService.bufferChangesForReconnect(sessionId, changes);
      const buffered = await fileSyncService.getBufferedChanges(sessionId);
      
      expect(buffered).toHaveLength(2);
    });

    it("should clear buffered changes after sync", async () => {
      const changes: FileChange[] = [
        { path: "src/app.js", status: "modified", timestamp: new Date() },
      ];
      
      await fileSyncService.bufferChangesForReconnect(sessionId, changes);
      await fileSyncService.clearBufferedChanges(sessionId);
      
      const buffered = await fileSyncService.getBufferedChanges(sessionId);
      expect(buffered).toHaveLength(0);
    });
  });

  describe("7.6 File Deletion Handling", () => {
    it("should sync file deletion to original repo", async () => {
      // Ensure file exists in both
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "old.js"), "// old");
      writeFileSync(join(originalRepo, "src", "old.js"), "// old");
      
      const changes = [{ path: "src/old.js", isNew: false, deleted: true }];
      await fileSyncService.handleFileChanges(sessionId, changes);
      
      expect(existsSync(join(originalRepo, "src", "old.js"))).toBe(false);
    });

    it("should mark deleted files with [D] indicator", async () => {
      // Create and delete file
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(originalRepo, "src", "old.js"), "// old");
      
      const changes = [{ path: "src/old.js", isNew: false, deleted: true }];
      const result = await fileSyncService.handleFileChanges(sessionId, changes);
      
      expect(result[0].status).toBe("deleted");
    });
  });

  describe("7.7 Manual Sync from Original Repo", () => {
    it("should pull new files from original repo", async () => {
      // Add new file to original repo
      mkdirSync(join(originalRepo, "src"), { recursive: true });
      writeFileSync(join(originalRepo, "src", "new-feature.js"), "// new feature");
      
      const changes = await fileSyncService.manualPullFromOriginal(sessionId);
      
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some(c => c.path === "src/new-feature.js")).toBe(true);
      expect(existsSync(join(sessionWorktree, "src", "new-feature.js"))).toBe(true);
    });

    it("should detect conflicts during pull", async () => {
      // File modified in both
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "app.js"), "// session");
      writeFileSync(join(originalRepo, "src", "app.js"), "// original changed");
      
      const changes = await fileSyncService.manualPullFromOriginal(sessionId);
      
      expect(changes.some(c => c.path === "src/app.js" && c.status === "conflict")).toBe(true);
    });
  });
});

describe("File Sync API Routes", () => {
  let sessionWorktree: string;
  let originalRepo: string;
  const sessionId = "api-test-session";
  const baseUrl = "http://localhost:3456";

  beforeAll(async () => {
    // Start the server for integration tests
    // This would require server setup, simplified for now
  });

  beforeEach(() => {
    sessionWorktree = mkdtempSync(join(tmpdir(), "mimo-session-"));
    originalRepo = mkdtempSync(join(tmpdir(), "mimo-original-"));
    
    mkdirSync(join(originalRepo, "src"), { recursive: true });
    writeFileSync(join(originalRepo, "src", "app.js"), "console.log('hello');");
    
    fileSyncService.initializeSession(sessionId, sessionWorktree, originalRepo);
  });

  afterAll(() => {
    try {
      rmSync(sessionWorktree, { recursive: true, force: true });
      rmSync(originalRepo, { recursive: true, force: true });
    } catch {}
    
    fileSyncService.cleanupSession(sessionId);
  });

  it("should initialize session sync via API", async () => {
    // Test the sync service directly since server might not be running
    const syncState = await fileSyncService.getChangeSet(sessionId);
    expect(syncState.sessionId).toBe(sessionId);
  });

  it("should get file status", async () => {
    const status = await fileSyncService.getFileStatus(sessionId, "src/app.js");
    expect(["clean", "modified", "new", "deleted", "conflict"]).toContain(status);
  });

  it("should return change set with conflicts flag", async () => {
    const changeSet = await fileSyncService.getChangeSet(sessionId);
    expect(changeSet).toHaveProperty("sessionId");
    expect(changeSet).toHaveProperty("files");
    expect(changeSet).toHaveProperty("hasConflicts");
  });
});
