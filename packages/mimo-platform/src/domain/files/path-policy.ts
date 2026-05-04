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
];

/**
 * Returns true if `path` is or contains an excluded system path component.
 *
 * Handles three cases:
 * - Exact match:           ".git"                → true
 * - Prefix/child match:    ".git/hooks/pre-push" → true
 * - Nested component:      "src/.git/config"     → true
 * - Normal project file:   "src/index.ts"        → false
 */
export function isExcluded(path: string): boolean {
  const segments = path.replace(/\\/g, "/").split("/");
  return EXCLUDED_PATHS.some((excluded) => segments.includes(excluded));
}
