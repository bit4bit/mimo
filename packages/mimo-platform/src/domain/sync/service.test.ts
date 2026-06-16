// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for lazy file sync.
 *
 * Verifies that session initialization avoids full recursive scans,
 * baseline checksums are recorded lazily on first sync, and conflict
 * detection still works for touched files.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockOS, type MockOS } from "../../infrastructure/os/mock-adapter.js";
import { FileSyncService } from "./service.js";
import type { FileChange } from "./service.js";

describe("FileSyncService lazy baseline", () => {
  let os: MockOS;
  let service: FileSyncService;
  let changes: FileChange[];

  beforeEach(() => {
    os = createMockOS() as MockOS;
    os.fs.seed({
      "/upstream": null,
      "/upstream/src": null,
      "/upstream/src/app.ts": "original app content",
      "/upstream/README.md": "# original",
      "/workspace": null,
      "/workspace/src": null,
      "/workspace/src/app.ts": "original app content",
      "/workspace/README.md": "# original",
    });

    changes = [];
    const mockSccService = {
      invalidateCache: () => {},
    };
    const sessionRepository = {
      findById: async () => ({
        id: "session-1",
        upstreamPath: "/upstream",
        agentWorkspacePath: "/workspace",
      }),
    };

    service = new FileSyncService({
      sessionRepository: sessionRepository as any,
      sccService: mockSccService as any,
      os,
    });
  });

  it("initializes session without scanning the whole tree", async () => {
    await service.initializeSession("session-1", "/workspace", "/upstream");
    const changeSet = await service.getChangeSet("session-1");
    expect(changeSet.files).toEqual([]);
  });

  it("records the upstream baseline on first sync of a path", async () => {
    await service.initializeSession("session-1", "/workspace", "/upstream");
    await service.handleFileChanges("session-1", [{ path: "src/app.ts" }]);

    os.fs.writeFile("/workspace/src/app.ts", "agent changed content");
    const secondChanges = await service.handleFileChanges("session-1", [
      { path: "src/app.ts" },
    ]);

    expect(secondChanges[0]?.status).not.toBe("conflict");
    expect(secondChanges[0]?.status).toBe("modified");
  });

  it("detects conflict when upstream changed before second agent edit", async () => {
    await service.initializeSession("session-1", "/workspace", "/upstream");
    await service.handleFileChanges("session-1", [{ path: "src/app.ts" }]);

    // Upstream changes behind the scenes
    os.fs.writeFile("/upstream/src/app.ts", "upstream changed content");
    os.fs.writeFile("/workspace/src/app.ts", "agent also changed");

    const secondChanges = await service.handleFileChanges("session-1", [
      { path: "src/app.ts" },
    ]);

    expect(secondChanges[0]?.status).toBe("conflict");
  });

  it("full baseline scan populates baseline checksums for all files", async () => {
    await service.initializeSession("session-1", "/workspace", "/upstream");
    await service.runFullBaselineScan("session-1");

    os.fs.writeFile("/upstream/src/app.ts", "upstream changed");
    os.fs.writeFile("/workspace/src/app.ts", "agent changed");

    const changes = await service.handleFileChanges("session-1", [
      { path: "src/app.ts" },
    ]);

    expect(changes[0]?.status).toBe("conflict");
  });
});
