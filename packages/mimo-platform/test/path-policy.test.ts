import { describe, it, expect } from "bun:test";
import { isExcluded, EXCLUDED_PATHS } from "../src/domain/files/path-policy.js";

describe("isExcluded", () => {
  describe("exact match", () => {
    it("returns true for .git", () => {
      expect(isExcluded(".git")).toBe(true);
    });

    it("returns true for .fossil", () => {
      expect(isExcluded(".fossil")).toBe(true);
    });

    it("returns true for .fossil-settings", () => {
      expect(isExcluded(".fossil-settings")).toBe(true);
    });

    it("returns true for .fslckout", () => {
      expect(isExcluded(".fslckout")).toBe(true);
    });

    it("returns true for _FOSSIL_", () => {
      expect(isExcluded("_FOSSIL_")).toBe(true);
    });

    it("returns true for .mimo", () => {
      expect(isExcluded(".mimo")).toBe(true);
    });

    it("returns true for .sccignore", () => {
      expect(isExcluded(".sccignore")).toBe(true);
    });

    it("returns true for .jscpdignore", () => {
      expect(isExcluded(".jscpdignore")).toBe(true);
    });
  });

  describe("prefix/child match", () => {
    it("returns true for .git/hooks/pre-push", () => {
      expect(isExcluded(".git/hooks/pre-push")).toBe(true);
    });

    it("returns true for .fossil-settings/ignore-glob", () => {
      expect(isExcluded(".fossil-settings/ignore-glob")).toBe(true);
    });

    it("returns true for .mimo/patches/session.patch", () => {
      expect(isExcluded(".mimo/patches/session.patch")).toBe(true);
    });
  });

  describe("nested component match", () => {
    it("returns true for src/.git/config", () => {
      expect(isExcluded("src/.git/config")).toBe(true);
    });

    it("returns true for workspace/.fossil-settings/ignore-glob", () => {
      expect(isExcluded("workspace/.fossil-settings/ignore-glob")).toBe(true);
    });

    it("returns true for deep/nested/.mimo/file", () => {
      expect(isExcluded("deep/nested/.mimo/file")).toBe(true);
    });
  });

  describe("normal project files", () => {
    it("returns false for src/index.ts", () => {
      expect(isExcluded("src/index.ts")).toBe(false);
    });

    it("returns false for package.json", () => {
      expect(isExcluded("package.json")).toBe(false);
    });

    it("returns false for test/service.test.ts", () => {
      expect(isExcluded("test/service.test.ts")).toBe(false);
    });

    it("returns false for .gitignore (not a VCS internal)", () => {
      expect(isExcluded(".gitignore")).toBe(false);
    });

    it("returns false for .mimoignore", () => {
      expect(isExcluded(".mimoignore")).toBe(false);
    });

    it("returns false for src/migrate.ts (contains 'git' as substring but not component)", () => {
      expect(isExcluded("src/migrate.ts")).toBe(false);
    });
  });

  describe("EXCLUDED_PATHS array", () => {
    it("exports a non-empty array", () => {
      expect(EXCLUDED_PATHS.length).toBeGreaterThan(0);
    });

    it("contains .git", () => {
      expect(EXCLUDED_PATHS).toContain(".git");
    });

    it("contains .fossil-settings", () => {
      expect(EXCLUDED_PATHS).toContain(".fossil-settings");
    });

    it("contains .hg and .svn for fossil ignore-glob sync", () => {
      expect(EXCLUDED_PATHS).toContain(".hg");
      expect(EXCLUDED_PATHS).toContain(".svn");
    });
  });
});
