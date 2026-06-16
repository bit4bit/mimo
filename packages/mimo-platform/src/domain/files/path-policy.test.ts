// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Unit tests for centralized path exclusion policy.
 *
 * Verifies that system, generated, and vendor paths are excluded while
 * ordinary project files remain visible.
 */

import { describe, it, expect } from "bun:test";
import { isExcluded, isGeneratedOrVendorPath } from "./path-policy.js";

describe("path-policy", () => {
  describe("isExcluded", () => {
    it("excludes VCS and MIMO internals", () => {
      expect(isExcluded(".git")).toBe(true);
      expect(isExcluded(".git/hooks/pre-push")).toBe(true);
      expect(isExcluded("src/.git/config")).toBe(true);
      expect(isExcluded(".mimo")).toBe(true);
      expect(isExcluded(".fossil")).toBe(true);
    });

    it("excludes lock and minified files", () => {
      expect(isExcluded("package-lock.json")).toBe(true);
      expect(isExcluded("yarn.lock")).toBe(true);
      expect(isExcluded("pnpm-lock.yaml")).toBe(true);
      expect(isExcluded("bun.lockb")).toBe(true);
      expect(isExcluded("app.min.js")).toBe(true);
      expect(isExcluded("app.min.css")).toBe(true);
      expect(isExcluded("something.lock")).toBe(true);
    });

    it("does not exclude ordinary project files", () => {
      expect(isExcluded("src/app.ts")).toBe(false);
      expect(isExcluded("README.md")).toBe(false);
      expect(isExcluded("package.json")).toBe(false);
    });
  });

  describe("isGeneratedOrVendorPath", () => {
    it("identifies common generated and vendor directories", () => {
      expect(isGeneratedOrVendorPath("node_modules")).toBe(true);
      expect(isGeneratedOrVendorPath("node_modules/lodash/index.js")).toBe(true);
      expect(isGeneratedOrVendorPath("__pycache__")).toBe(true);
      expect(isGeneratedOrVendorPath(".next")).toBe(true);
      expect(isGeneratedOrVendorPath("dist/bundle.js")).toBe(true);
      expect(isGeneratedOrVendorPath("build")).toBe(true);
      expect(isGeneratedOrVendorPath("out")).toBe(true);
      expect(isGeneratedOrVendorPath("target/classes")).toBe(true);
      expect(isGeneratedOrVendorPath("vendor")).toBe(true);
    });

    it("does not flag ordinary source paths", () => {
      expect(isGeneratedOrVendorPath("src/node_modules-plugin.ts")).toBe(false);
      expect(isGeneratedOrVendorPath("src/app.ts")).toBe(false);
      expect(isGeneratedOrVendorPath("README.md")).toBe(false);
    });
  });
});
