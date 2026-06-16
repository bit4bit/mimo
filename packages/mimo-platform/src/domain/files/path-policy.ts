// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Centralized path exclusion policy.
 *
 * Defines which paths are treated as invisible system machinery across all
 * subsystems: file finder, impact analysis, VCS scan, and diff cleaning.
 *
 * Pure module — no I/O, no state, no configuration.
 */

/**
 * Canonical list of built-in excluded path components.
 * Every consumer that needs to enumerate patterns (e.g. syncIgnoresToFossil)
 * maps from this array.
 */
export const EXCLUDED_PATHS: readonly string[] = [
  // Git internals
  ".git",
  // Fossil internals
  ".fossil",
  ".fslckout",
  ".fslckout-journal",
  ".fossil-settings",
  // Fossil metadata files (committed to index but must be removed)
  "_FOSSIL_",
  // Mimo internals
  ".mimo",
  ".mimo-patches",
  // Tool config files treated as invisible
  ".sccignore",
  ".jscpdignore",
  // Other VCS systems (kept for fossil ignore-glob sync)
  ".hg",
  ".svn",
  // Generated / vendor / build output commonly found in large repositories
  "node_modules",
  "__pycache__",
  ".next",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "*.min.js",
  "*.min.css",
];

/**
 * File name / path components that identify generated or vendor content.
 * Unlike {@link EXCLUDED_PATHS}, this list is intended for subsystems that want
 * stricter filtering (e.g. file sync, impact calculation) while keeping the
 * broader exclusion list for general visibility boundaries.
 */
const GENERATED_OR_VENDOR_COMPONENTS: readonly string[] = [
  "node_modules",
  "__pycache__",
  ".next",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
];

/**
 * Returns true if `path` is or contains an excluded system path component.
 *
 * Handles three cases:
 * - Exact match:           ".git"                → true
 * - Prefix/child match:    ".git/hooks/pre-push" → true
 * - Nested component:      "src/.git/config"     → true
 * - Normal project file:   "src/index.ts"        → false
 *
 * EXCLUDED_PATHS may also contain simple glob patterns (e.g. "*.lock",
 * "*.min.js"). These are matched against the final segment of the path.
 */
export function isExcluded(path: string): boolean {
  const segments = path.replace(/\\/g, "/").split("/");
  return EXCLUDED_PATHS.some((excluded) => {
    // Simple glob patterns apply to the basename only
    if (excluded.includes("*")) {
      return segments.some((segment) => matchGlobPattern(excluded, segment));
    }
    return segments.includes(excluded);
  });
}

/**
 * Minimal glob matcher for a single path segment.
 * Supports `*` (zero or more characters, not `/`) only.
 */
function matchGlobPattern(pattern: string, subject: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
  );
  return regex.test(subject);
}

/**
 * Returns true if `path` passes through or names a generated / vendor directory.
 *
 * This is stricter than {@link isExcluded} and is meant to short-circuit
 * expensive per-file operations (sync, impact, listing) for directories that
 * are produced by build tools or package managers.
 */
export function isGeneratedOrVendorPath(path: string): boolean {
  const segments = path.replace(/\\/g, "/").split("/");
  return GENERATED_OR_VENDOR_COMPONENTS.some((component) =>
    segments.includes(component),
  );
}
