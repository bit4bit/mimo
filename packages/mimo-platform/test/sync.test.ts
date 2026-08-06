import {
  describe,
  it,
  expect,
  afterAll,
  afterEach,
  beforeEach,
} from "bun:test";
import {
  FileSyncService,
  FileChange,
  FileStatus,
} from "../src/domain/sync/service";
import { detectChangedFiles } from "../src/domain/files/changed-files";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createOS } from "../src/infrastructure/os/node-adapter.js";

describe("File Synchronization", () => {
  let sessionWorktree: string;
  let originalRepo: string;
  let fileSyncService: FileSyncService;
  const sessionId = "test-session-123";

  beforeEach(() => {
    // Create temporary directories for testing
    sessionWorktree = mkdtempSync(join(tmpdir(), "mimo-session-"));
    originalRepo = mkdtempSync(join(tmpdir(), "mimo-original-"));

    // Create some test files in original repo
    mkdirSync(join(originalRepo, "src"), { recursive: true });
    writeFileSync(join(originalRepo, "src", "app.js"), "console.log('hello');");
    writeFileSync(join(originalRepo, "README.md"), "# Test Project");

    // Create FileSyncService with proper OS injection
    const os = createOS({ ...process.env });
    fileSyncService = new FileSyncService({
      sessionRepository: {} as any,
      sccService: { invalidateCache: () => {} } as any,
      os,
    });

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
      writeFileSync(
        join(sessionWorktree, "src", "app.js"),
        "console.log('modified');",
      );

      const result = await fileSyncService.handleFileChanges(
        sessionId,
        changes,
      );

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
      writeFileSync(
        join(sessionWorktree, "src", "app.js"),
        "console.log('modified');",
      );
      writeFileSync(join(sessionWorktree, "README.md"), "# Modified");

      const result = await fileSyncService.handleFileChanges(
        sessionId,
        changes,
      );

      expect(result).toHaveLength(2);
    });

    it("should detect new file creation", async () => {
      const changes = [{ path: "src/new.ts", isNew: true, deleted: false }];

      // Create the file in session worktree
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(sessionWorktree, "src", "new.ts"), "const x = 1;");

      const result = await fileSyncService.handleFileChanges(
        sessionId,
        changes,
      );

      expect(result[0].status).toBe("new");
    });

    it("broadcasts impact stale callback when changes are processed", async () => {
      let staleSessionId: string | null = null;
      fileSyncService.setImpactStaleHandler((id: string) => {
        staleSessionId = id;
      });

      const changes = [{ path: "src/app.js", isNew: false, deleted: false }];
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(
        join(sessionWorktree, "src", "app.js"),
        "console.log('changed');",
      );

      await fileSyncService.handleFileChanges(sessionId, changes);

      expect(staleSessionId).toBe(sessionId);
    });
  });

  describe("7.2 Upstream Baseline Is Not Mutated", () => {
    // upstream/ is the committed baseline and carries the external `origin`
    // remote. FileSyncService must never write to it; changes are published
    // explicitly via CommitService.commitAndPushSelective.
    it("does not copy modified files into the upstream baseline", async () => {
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(
        join(sessionWorktree, "src", "app.js"),
        "console.log('synced');",
      );

      const changes = [{ path: "src/app.js", isNew: false, deleted: false }];
      await fileSyncService.handleFileChanges(sessionId, changes);

      const upstreamContent = readFileSync(
        join(originalRepo, "src", "app.js"),
        "utf-8",
      );
      expect(upstreamContent).toBe("console.log('hello');");
    });

    it("does not create new files in the upstream baseline", async () => {
      mkdirSync(join(sessionWorktree, "src", "components"), {
        recursive: true,
      });
      writeFileSync(
        join(sessionWorktree, "src", "components", "Button.tsx"),
        "export const Button = () => {};",
      );

      const changes = [
        { path: "src/components/Button.tsx", isNew: true, deleted: false },
      ];
      await fileSyncService.handleFileChanges(sessionId, changes);

      expect(
        existsSync(join(originalRepo, "src", "components", "Button.tsx")),
      ).toBe(false);
    });

    it("leaves the change detectable between upstream and agent-workspace", async () => {
      // Regression: previously the live mirror copied edits into upstream,
      // making the two trees identical so detectChangedFiles (and the commit
      // preview/push) saw "no changes". The baseline must stay untouched so the
      // diff survives until an explicit commit.
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(
        join(sessionWorktree, "src", "app.js"),
        "console.log('synced');",
      );

      const changes = [{ path: "src/app.js", isNew: false, deleted: false }];
      await fileSyncService.handleFileChanges(sessionId, changes);

      const os = createOS({ ...process.env });
      const detected = await detectChangedFiles(
        os,
        originalRepo,
        sessionWorktree,
      );
      expect(
        detected.files.some(
          (f) => f.path === "src/app.js" && f.status === "modified",
        ),
      ).toBe(true);
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
    it("does not delete files from the upstream baseline", async () => {
      // The deletion is recorded for the change set, but upstream/ (the
      // committed baseline) must keep the file until an explicit commit.
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(originalRepo, "src", "old.js"), "// old");

      const changes = [{ path: "src/old.js", isNew: false, deleted: true }];
      await fileSyncService.handleFileChanges(sessionId, changes);

      expect(existsSync(join(originalRepo, "src", "old.js"))).toBe(true);
    });

    it("should mark deleted files with [D] indicator", async () => {
      // Create and delete file
      mkdirSync(join(sessionWorktree, "src"), { recursive: true });
      writeFileSync(join(originalRepo, "src", "old.js"), "// old");

      const changes = [{ path: "src/old.js", isNew: false, deleted: true }];
      const result = await fileSyncService.handleFileChanges(
        sessionId,
        changes,
      );

      expect(result[0].status).toBe("deleted");
    });
  });
});

describe("File Sync API Routes", () => {
  let sessionWorktree: string;
  let originalRepo: string;
  let fileSyncService: FileSyncService;
  const sessionId = "api-test-session";

  beforeEach(() => {
    sessionWorktree = mkdtempSync(join(tmpdir(), "mimo-session-"));
    originalRepo = mkdtempSync(join(tmpdir(), "mimo-original-"));

    mkdirSync(join(originalRepo, "src"), { recursive: true });
    writeFileSync(join(originalRepo, "src", "app.js"), "console.log('hello');");

    // Create FileSyncService with proper OS injection
    const os = createOS({ ...process.env });
    fileSyncService = new FileSyncService({
      sessionRepository: {} as any,
      sccService: { invalidateCache: () => {} } as any,
      os,
    });

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
    expect(["clean", "modified", "new", "deleted", "conflict"]).toContain(
      status,
    );
  });

  it("should return change set with conflicts flag", async () => {
    const changeSet = await fileSyncService.getChangeSet(sessionId);
    expect(changeSet).toHaveProperty("sessionId");
    expect(changeSet).toHaveProperty("files");
    expect(changeSet).toHaveProperty("hasConflicts");
  });
});

describe("File Sync multi-repo (repo-qualified file changes)", () => {
  let workspaceRoot: string;
  let upstreamRoot: string;
  let fileSyncService: FileSyncService;
  const sessionId = "multi-repo-session";

  beforeEach(async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "mimo-ws-"));
    upstreamRoot = mkdtempSync(join(tmpdir(), "mimo-up-"));

    // Two mounted repos: "second" and "third".
    mkdirSync(join(workspaceRoot, "second"), { recursive: true });
    mkdirSync(join(workspaceRoot, "third"), { recursive: true });
    mkdirSync(join(upstreamRoot, "second"), { recursive: true });
    mkdirSync(join(upstreamRoot, "third"), { recursive: true });

    const os = createOS({ ...process.env });
    fileSyncService = new FileSyncService({
      sessionRepository: {
        findById: async () => ({
          id: sessionId,
          agentWorkspacePath: workspaceRoot,
          upstreamPath: upstreamRoot,
          repos: [
            {
              projectRepoId: "second",
              upstreamPath: join(upstreamRoot, "second"),
              workspacePath: join(workspaceRoot, "second"),
            },
            {
              projectRepoId: "third",
              upstreamPath: join(upstreamRoot, "third"),
              workspacePath: join(workspaceRoot, "third"),
            },
          ],
        }),
      } as any,
      sccService: { invalidateCache: () => {} } as any,
      os,
    });

    await fileSyncService.initializeSession(
      sessionId,
      workspaceRoot,
      upstreamRoot,
    );
  });

  afterEach(() => {
    try {
      rmSync(workspaceRoot, { recursive: true, force: true });
      rmSync(upstreamRoot, { recursive: true, force: true });
    } catch {}
    fileSyncService.cleanupSession(sessionId);
  });

  it("records a new file in the 'second' repo with repo-qualified identity and reads its info from the correct workspace", async () => {
    // Agent creates second/test.md
    writeFileSync(join(workspaceRoot, "second", "test.md"), "# hello");

    const result = await fileSyncService.handleFileChanges(sessionId, [
      { repoId: "second", path: "test.md", isNew: true, deleted: false },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].repoId).toBe("second");
    expect(result[0].path).toBe("test.md");
    expect(result[0].status).toBe("new");
    // getFileInfo must read from the 'second' workspace, so size > 0.
    expect(result[0].size).toBeGreaterThan(0);

    // getFileStatus must be retrievable by repoId + path.
    const status = await fileSyncService.getFileStatus(
      sessionId,
      "test.md",
      "second",
    );
    expect(status).toBe("new");
  });

  it("keeps changes from different repos with the same path separate", async () => {
    writeFileSync(join(workspaceRoot, "second", "dup.md"), "a");
    writeFileSync(join(workspaceRoot, "third", "dup.md"), "bb");

    await fileSyncService.handleFileChanges(sessionId, [
      { repoId: "second", path: "dup.md", isNew: true, deleted: false },
      { repoId: "third", path: "dup.md", isNew: true, deleted: false },
    ]);

    const changeSet = await fileSyncService.getChangeSet(sessionId);
    const dupFiles = changeSet.files.filter((f) => f.path === "dup.md");
    expect(dupFiles).toHaveLength(2);
    expect(dupFiles.map((f) => f.repoId).sort()).toEqual(["second", "third"]);
  });
});
