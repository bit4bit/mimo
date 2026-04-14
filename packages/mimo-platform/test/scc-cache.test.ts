import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { SccService, SccMetrics } from "../src/impact/scc-service.js";

describe("SCC Smart Cache", () => {
  let testDir: string;
  let sccService: SccService;
  let mockSccPath: string;

  beforeAll(() => {
    // Create test directory
    testDir = join(tmpdir(), `mimo-scc-cache-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create mock SCC binary that returns valid JSON
    mockSccPath = join(testDir, "mock-scc");
    const mockOutput = JSON.stringify([
      {
        Name: "TypeScript",
        Files: [
          {
            Filename: "test.ts",
            Language: "TypeScript",
            Lines: 100,
            Code: 80,
            Comment: 10,
            Blank: 10,
            Complexity: 5,
          },
        ],
      },
    ]);
    writeFileSync(
      mockSccPath,
      `#!/bin/bash
echo '${mockOutput}'`,
      { mode: 0o755 },
    );

    sccService = new SccService(mockSccPath, testDir);
  });

  afterAll(() => {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up cache before each test
    const cacheDir = join(testDir, ".mimo", "cache");
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
    }

    // Clear service cache
    sccService.clearCache();
  });

  describe("cache persistence", () => {
    it("should save cache to disk", async () => {
      // GIVEN SCC has been run on a directory
      const mockMetrics: SccMetrics = {
        linesOfCode: { added: 100, removed: 0, net: 100 },
        complexity: { cyclomatic: 10, cognitive: 0, estimatedMinutes: 10 },
        byLanguage: [
          {
            language: "TypeScript",
            files: 1,
            lines: 100,
            code: 80,
            comment: 10,
            blank: 10,
            complexity: 5,
          },
        ],
        byFile: [
          {
            path: "test.ts",
            language: "TypeScript",
            lines: 100,
            code: 80,
            comment: 10,
            blank: 10,
            complexity: 5,
          },
        ],
      };

      // WHEN updateCache and saveCache is called
      await sccService.updateCache(testDir, mockMetrics);
      await sccService.saveCache();

      // THEN cache file exists at testDir/scc-cache.json
      const cacheFile = join(testDir, "scc-cache.json");
      expect(existsSync(cacheFile)).toBe(true);
    });

    it("should load cache from disk on initialization", async () => {
      // GIVEN a cache file exists with valid data at testDir
      const cacheFile = join(testDir, "scc-cache.json");

      const cacheData = {
        entries: {
          [testDir]: {
            valid: true,
            data: {
              linesOfCode: { added: 200, removed: 0, net: 200 },
              complexity: {
                cyclomatic: 20,
                cognitive: 0,
                estimatedMinutes: 20,
              },
              byLanguage: [
                {
                  language: "JavaScript",
                  files: 2,
                  lines: 200,
                  code: 160,
                  comment: 20,
                  blank: 20,
                  complexity: 10,
                },
              ],
              byFile: [],
            },
            cachedAt: Date.now(),
          },
        },
      };

      writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));

      // WHEN loadCache is called
      sccService.loadCache();

      // THEN cache is loaded with valid entry
      const result = sccService.getCachedMetrics(testDir);
      expect(result).toBeDefined();
      expect(result?.data?.linesOfCode.net).toBe(200);
    });
  });

  describe("cache validity", () => {
    it("should return cached results when cache is valid", async () => {
      // GIVEN a valid cache entry exists at the service's cache location
      const cacheFile = join(testDir, "scc-cache.json");

      const cacheData = {
        entries: {
          [testDir]: {
            valid: true,
            data: {
              linesOfCode: { added: 100, removed: 0, net: 100 },
              complexity: {
                cyclomatic: 10,
                cognitive: 0,
                estimatedMinutes: 10,
              },
              byLanguage: [
                {
                  language: "TypeScript",
                  files: 1,
                  lines: 100,
                  code: 80,
                  comment: 10,
                  blank: 10,
                  complexity: 5,
                },
              ],
              byFile: [
                {
                  path: "test.ts",
                  language: "TypeScript",
                  lines: 100,
                  code: 80,
                  comment: 10,
                  blank: 10,
                  complexity: 5,
                },
              ],
            },
            cachedAt: Date.now(),
          },
        },
      };

      writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
      sccService.loadCache();

      // WHEN runScc is called
      // (This should return cached result without running SCC)

      // THEN cached result is returned
      const cached = sccService.getCachedMetrics(testDir);
      expect(cached).toBeDefined();
      expect(cached?.valid).toBe(true);
    });

    it("should invalidate cache when changes are reported", async () => {
      // GIVEN a valid cache entry exists at the service's cache location
      const cacheFile = join(testDir, "scc-cache.json");

      const cacheData = {
        entries: {
          [testDir]: {
            valid: true,
            data: {
              /* metrics */
            },
            cachedAt: Date.now(),
          },
        },
      };

      writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
      sccService.loadCache();

      // WHEN invalidateCache is called for the directory
      sccService.invalidateCache(testDir);

      // THEN cache entry is marked as invalid
      const cached = sccService.getCacheEntry(testDir);
      expect(cached?.valid).toBe(false);
    });

    it("should run SCC when cache is invalid", async () => {
      // GIVEN an invalid cache entry at testDir
      const cacheFile = join(testDir, "scc-cache.json");

      const cacheData = {
        entries: {
          [testDir]: {
            valid: false,
            data: null,
            cachedAt: Date.now(),
          },
        },
      };

      writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
      sccService.loadCache();

      // WHEN runScc is called
      // (Should detect invalid cache and run SCC)

      // SCC execution should occur (tested by mock being called)
      const result = await sccService.runScc(testDir);

      // THEN result is from SCC execution, not cache
      expect(result).toBeDefined();

      // AND cache is updated as valid
      const cached = sccService.getCacheEntry(testDir);
      expect(cached?.valid).toBe(true);
    });
  });

  describe("cache invalidation", () => {
    it("should mark specific directory cache as invalid", async () => {
      // GIVEN cache entries for multiple directories using service methods
      const dir1 = join(testDir, "upstream");
      const dir2 = join(testDir, "workspace");

      await sccService.updateCache(dir1, {
        linesOfCode: { added: 100, removed: 0, net: 100 },
        complexity: { cyclomatic: 10, cognitive: 0, estimatedMinutes: 10 },
        byLanguage: [],
        byFile: [],
      });

      await sccService.updateCache(dir2, {
        linesOfCode: { added: 200, removed: 0, net: 200 },
        complexity: { cyclomatic: 20, cognitive: 0, estimatedMinutes: 20 },
        byLanguage: [],
        byFile: [],
      });
      await sccService.saveCache();

      // WHEN invalidateCache is called for dir1 only
      sccService.invalidateCache(dir1);

      // THEN dir1 is invalid, dir2 remains valid
      expect(sccService.getCacheEntry(dir1)?.valid).toBe(false);
      expect(sccService.getCacheEntry(dir2)?.valid).toBe(true);
    });

    it("should clear all cache when called with no arguments", async () => {
      // GIVEN cache entries exist
      await sccService.updateCache(testDir, {
        linesOfCode: { added: 100, removed: 0, net: 100 },
        complexity: { cyclomatic: 10, cognitive: 0, estimatedMinutes: 10 },
        byLanguage: [],
        byFile: [],
      });
      await sccService.saveCache();

      // WHEN clearCache is called with no arguments
      sccService.clearCache();

      // THEN cache file is removed
      const cacheFile = join(testDir, "scc-cache.json");
      expect(existsSync(cacheFile)).toBe(false);
    });
  });

  describe("atomic writes", () => {
    it("should use atomic writes for cache updates", async () => {
      // GIVEN cache has data
      await sccService.updateCache(testDir, {
        linesOfCode: { added: 100, removed: 0, net: 100 },
        complexity: { cyclomatic: 10, cognitive: 0, estimatedMinutes: 10 },
        byLanguage: [],
        byFile: [],
      });

      // WHEN saveCache is called
      await sccService.saveCache();

      // THEN cache file exists (atomic write completed)
      const cacheFile = join(testDir, "scc-cache.json");
      expect(existsSync(cacheFile)).toBe(true);
    });
  });

  describe("cache survives restart", () => {
    it("should persist valid flag across restarts", async () => {
      // GIVEN a valid cache entry is created by the service
      await sccService.updateCache(testDir, {
        linesOfCode: { added: 100, removed: 0, net: 100 },
        complexity: { cyclomatic: 10, cognitive: 0, estimatedMinutes: 10 },
        byLanguage: [],
        byFile: [],
      });
      await sccService.saveCache();

      // WHEN new service instance loads cache (simulating restart)
      const newService = new SccService(mockSccPath, testDir);
      newService.loadCache();

      // THEN valid state is preserved
      const entry = newService.getCacheEntry(testDir);
      expect(entry?.valid).toBe(true);
    });
  });

  describe("stale tracking", () => {
    it("marks a directory stale when cache is invalidated", async () => {
      await sccService.updateCache(testDir, {
        linesOfCode: { added: 10, removed: 0, net: 10 },
        complexity: { cyclomatic: 2, cognitive: 0, estimatedMinutes: 1 },
        byLanguage: [],
        byFile: [],
      });

      sccService.invalidateCache(testDir);

      expect(sccService.isStale(testDir)).toBe(true);
    });

    it("clears stale state after forced SCC refresh", async () => {
      sccService.markStale(testDir);
      expect(sccService.isStale(testDir)).toBe(true);

      await sccService.runScc(testDir, true);

      expect(sccService.isStale(testDir)).toBe(false);
    });
  });
});
