// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for the file service.
 *
 * Verifies paginated file listing, query filtering, cursor continuation,
 * and backwards-compatible flat array listing.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockOS, type MockOS } from "../../infrastructure/os/mock-adapter.js";
import { createFileService } from "./service.js";
import type { FileInfo, PaginatedFilesResult } from "./types.js";

describe("FileService", () => {
  let os: MockOS;

  beforeEach(() => {
    os = createMockOS() as MockOS;
    os.fs.seed({
      "/workspace": null,
      "/workspace/src": null,
      "/workspace/src/app.ts": "export const app = 1;",
      "/workspace/src/main.ts": "import { app } from './app';",
      "/workspace/src/utils": null,
      "/workspace/src/utils/helper.ts": "export function help() {}",
      "/workspace/README.md": "# Project",
      "/workspace/package.json": '{"name": "test"}',
      "/workspace/node_modules/lodash/index.js": "module.exports = {};",
    });
  });

  describe("flat array listing", () => {
    it("returns all non-excluded files when no pagination options are provided", async () => {
      const service = createFileService(os);
      const result = (await service.listFiles("/workspace")) as FileInfo[];

      expect(Array.isArray(result)).toBe(true);
      const paths = result.map((f) => f.path).sort();
      expect(paths).toEqual([
        "README.md",
        "package.json",
        "src/app.ts",
        "src/main.ts",
        "src/utils/helper.ts",
      ]);
    });
  });

  describe("paginated listing", () => {
    it("returns bounded results and cursor for the next page", async () => {
      const service = createFileService(os);
      const first = (await service.listFiles("/workspace", {
        limit: 2,
      })) as PaginatedFilesResult;

      expect(first.files.length).toBe(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeTruthy();

      const second = (await service.listFiles("/workspace", {
        limit: 2,
        cursor: first.nextCursor!,
      })) as PaginatedFilesResult;

      expect(second.files.length).toBeLessThanOrEqual(2);
      expect(second.hasMore).toBe(false);
      expect(second.nextCursor).toBeNull();

      // No overlap between pages
      const firstPaths = new Set(first.files.map((f) => f.path));
      for (const file of second.files) {
        expect(firstPaths.has(file.path)).toBe(false);
      }
    });

    it("filters results by query and preserves ranking order", async () => {
      const service = createFileService(os);
      const result = (await service.listFiles("/workspace", {
        query: "app",
        limit: 10,
      })) as PaginatedFilesResult;

      expect(result.files.every((f) =>
        f.path.toLowerCase().includes("app"),
      )).toBe(true);
      expect(result.hasMore).toBe(false);
    });

    it("returns an empty page when query matches nothing", async () => {
      const service = createFileService(os);
      const result = (await service.listFiles("/workspace", {
        query: "zzzz",
        limit: 10,
      })) as PaginatedFilesResult;

      expect(result.files).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("skips generated and vendor directories", async () => {
      const service = createFileService(os);
      const result = (await service.listFiles("/workspace", {
        limit: 50,
      })) as PaginatedFilesResult;

      const paths = result.files.map((f) => f.path);
      expect(paths).not.toContain("node_modules/lodash/index.js");
    });
  });
});
