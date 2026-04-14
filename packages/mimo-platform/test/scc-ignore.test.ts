import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SccService } from "../src/impact/scc-service.js";

describe("SCC Composite Ignore File", () => {
  let testDir: string;
  let sccService: SccService;
  let mockSccPath: string;

  beforeAll(() => {
    // Create test directory
    testDir = join(tmpdir(), `mimo-scc-ignore-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create mock SCC binary
    mockSccPath = join(testDir, "mock-scc");
    writeFileSync(
      mockSccPath,
      `#!/bin/bash
echo '[]'`,
      { mode: 0o755 },
    );

    sccService = new SccService(mockSccPath);
  });

  afterAll(() => {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up test files before each test
    const files = [
      join(testDir, ".fossil-settings", "ignore-glob"),
      join(testDir, ".gitignore"),
      join(testDir, ".mimoignore"),
      join(testDir, ".sccignore"),
    ];
    files.forEach((f) => {
      if (existsSync(f)) {
        rmSync(f, { force: true });
      }
    });

    // Clean up directories
    const dirs = [
      join(testDir, ".fossil-settings"),
      join(testDir, ".mimo", "cache"),
      join(testDir, ".mimo"),
    ];
    dirs.forEach((d) => {
      if (existsSync(d)) {
        rmSync(d, { recursive: true, force: true });
      }
    });
  });

  describe("buildIgnoreFile", () => {
    it("should create composite ignore file from all three sources", async () => {
      // GIVEN all three ignore files exist
      mkdirSync(join(testDir, ".fossil-settings"), { recursive: true });
      writeFileSync(
        join(testDir, ".fossil-settings", "ignore-glob"),
        "node_modules/\n.git/",
      );
      writeFileSync(join(testDir, ".gitignore"), "dist/\nbuild/");
      writeFileSync(join(testDir, ".mimoignore"), ".mimo/cache/\n*.tmp");

      // WHEN buildIgnoreFile is called
      const result = await sccService.buildIgnoreFile(testDir);

      // THEN composite file is created at correct path (.sccignore in target directory)
      const compositePath = join(testDir, ".sccignore");
      expect(existsSync(compositePath)).toBe(true);

      // AND result is the path to composite file
      expect(result).toBe(compositePath);

      // AND file contains patterns from all sources
      const content = new TextDecoder().decode(
        await Bun.file(compositePath).arrayBuffer(),
      );
      expect(content).toContain("node_modules/");
      expect(content).toContain("dist/");
      expect(content).toContain(".mimo/cache/");
    });

    it("should include source annotations in composite file", async () => {
      // GIVEN multiple ignore sources exist
      mkdirSync(join(testDir, ".fossil-settings"), { recursive: true });
      writeFileSync(
        join(testDir, ".fossil-settings", "ignore-glob"),
        "vendor/",
      );
      writeFileSync(join(testDir, ".gitignore"), "*.log");
      writeFileSync(join(testDir, ".mimoignore"), "cache/");

      // WHEN buildIgnoreFile is called
      await sccService.buildIgnoreFile(testDir);

      // THEN composite file has source annotations
      const compositePath = join(testDir, ".sccignore");
      const content = new TextDecoder().decode(
        await Bun.file(compositePath).arrayBuffer(),
      );

      expect(content).toContain("# --- From: .fossil-settings/ignore-glob ---");
      expect(content).toContain("# --- From: .gitignore ---");
      expect(content).toContain("# --- From: .mimoignore ---");
    });

    it("should warn when some source files are missing", async () => {
      // GIVEN only .gitignore exists
      writeFileSync(join(testDir, ".gitignore"), "*.log");
      // .fossil-settings and .mimoignore don't exist

      // WHEN buildIgnoreFile is called
      const consoleSpy = [];
      const originalWarn = console.warn;
      console.warn = (...args) => consoleSpy.push(args);

      await sccService.buildIgnoreFile(testDir);

      console.warn = originalWarn;

      // THEN warnings are logged for missing files
      expect(consoleSpy.length).toBeGreaterThan(0);
      const warnings = consoleSpy.flat().join(" ");
      expect(warnings).toContain("fossil-settings");
      expect(warnings).toContain("mimoignore");
    });

    it("should work with only .gitignore", async () => {
      // GIVEN only .gitignore exists
      writeFileSync(join(testDir, ".gitignore"), "node_modules/\ndist/");

      // WHEN buildIgnoreFile is called
      const result = await sccService.buildIgnoreFile(testDir);

      // THEN composite file is created with .gitignore content (.sccignore)
      const compositePath = join(testDir, ".sccignore");
      expect(existsSync(compositePath)).toBe(true);

      const content = new TextDecoder().decode(
        await Bun.file(compositePath).arrayBuffer(),
      );
      expect(content).toContain("node_modules/");
      expect(content).toContain("dist/");
    });

    it("should preserve duplicate patterns from different sources", async () => {
      // GIVEN same pattern in multiple files
      mkdirSync(join(testDir, ".fossil-settings"), { recursive: true });
      writeFileSync(join(testDir, ".fossil-settings", "ignore-glob"), "temp/");
      writeFileSync(join(testDir, ".gitignore"), "temp/");
      writeFileSync(join(testDir, ".mimoignore"), "temp/");

      // WHEN buildIgnoreFile is called
      await sccService.buildIgnoreFile(testDir);

      // THEN all occurrences are preserved
      const compositePath = join(testDir, ".sccignore");
      const content = new TextDecoder().decode(
        await Bun.file(compositePath).arrayBuffer(),
      );

      // Should appear 3 times (once per source)
      const matches = content.match(/temp\//g);
      expect(matches?.length).toBe(3);
    });

    it("should create .sccignore file in target directory", async () => {
      // GIVEN .sccignore doesn't exist yet
      const sccIgnorePath = join(testDir, ".sccignore");
      expect(existsSync(sccIgnorePath)).toBe(false);

      // GIVEN an ignore file exists
      writeFileSync(join(testDir, ".gitignore"), "*.log");

      // WHEN buildIgnoreFile is called
      await sccService.buildIgnoreFile(testDir);

      // THEN .sccignore file is created in target directory
      expect(existsSync(sccIgnorePath)).toBe(true);
    });
  });
});
