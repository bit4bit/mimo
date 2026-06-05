// SPDX-License-Identifier: AGPL-3.0-only
import type { FileInfo, FileService } from "./types.js";
import type { DirEnt, OS } from "../../infrastructure/os/types.js";
import { isExcluded } from "./path-policy.js";

export function loadIgnorePatterns(workspacePath: string, os: OS): string[] {
  const files = [".gitignore", ".mimoignore"];
  const patterns: string[] = [];
  for (const name of files) {
    const fullPath = os.path.join(workspacePath, name);
    if (!os.fs.exists(fullPath)) continue;
    try {
      const lines = os.fs.readFile(fullPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
        patterns.push(trimmed);
      }
    } catch {
      // unreadable — skip
    }
  }
  return patterns;
}

export function applyIgnorePatterns(
  files: FileInfo[],
  patterns: string[],
): FileInfo[] {
  if (patterns.length === 0) return files;

  // Split into normal and negation patterns, preserving order
  const entries = patterns.map((p) => ({
    negate: p.startsWith("!"),
    pattern: p.startsWith("!") ? p.slice(1) : p,
  }));

  return files.filter((file) => {
    let ignored = false;
    for (const { negate, pattern } of entries) {
      if (patternMatchesFile(pattern, file.path)) {
        ignored = !negate;
      }
    }
    return !ignored;
  });
}

function matchesPart(pattern: string, part: string): boolean {
  try {
    return minimatch(pattern, part);
  } catch {
    return false;
  }
}

function patternMatchesFile(pattern: string, filePath: string): boolean {
  // Trailing slash = directory match
  if (pattern.endsWith("/")) {
    const dirPattern = pattern.slice(0, -1);
    if (dirPattern.includes("/")) {
      // Anchored like `src/generated/` — only match at this exact location
      return filePath === dirPattern || filePath.startsWith(dirPattern + "/");
    }
    // Unanchored like `node_modules/` — match that directory component at any depth
    const parts = filePath.split("/");
    return parts.slice(0, -1).some((part) => matchesPart(dirPattern, part));
  }

  // Strip leading **/ — match at any depth
  const globalPrefix = pattern.startsWith("**/");
  const corePattern = globalPrefix ? pattern.slice(3) : pattern;
  const isPathAnchored = !globalPrefix && corePattern.includes("/");

  if (isPathAnchored) {
    // Pattern like `src/generated/*` — match against full path only
    try {
      return minimatch(pattern, filePath);
    } catch {
      return false;
    }
  }

  // No `/` in core (or was `**/pattern`): match against any path component
  // (a matching directory component excludes all files inside it)
  const parts = filePath.split("/");
  return parts.some((part) => matchesPart(corePattern, part));
}

/** Minimal glob matcher supporting `*`, `**`, and `?`. */
function minimatch(pattern: string, subject: string): boolean {
  const reStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials except * and ?
    .replace(/\*\*/g, "\x00") // placeholder for **
    .replace(/\*/g, "[^/]*") // * → any chars except /
    .replace(/\x00/g, ".*") // ** → any chars including /
    .replace(/\?/g, "[^/]"); // ? → single char except /
  return new RegExp("^" + reStr + "$").test(subject);
}

export function matchesPattern(filePath: string, pattern: string): boolean {
  if (!pattern.trim()) return true;
  return filePath.toLowerCase().includes(pattern.toLowerCase().trim());
}

function normalizeQuery(query: string): string {
  return query.replace(/\\/g, "/").replace(/^\.\//, "").trim().toLowerCase();
}

function getBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

function scoreFileMatch(path: string, name: string, pattern: string): number {
  if (!pattern) return 0;

  const pathLower = path.toLowerCase();
  const nameLower = name.toLowerCase();
  const normalizedPattern = normalizeQuery(pattern);
  if (!normalizedPattern) return 0;

  const namePattern = getBasename(normalizedPattern);

  if (pathLower === normalizedPattern) return 0;
  if (normalizedPattern.endsWith(`/${pathLower}`)) return 1;
  if (pathLower.startsWith(normalizedPattern)) return 2;
  if (pathLower.includes(normalizedPattern)) return 3;
  if (nameLower === namePattern) return 4;
  if (nameLower.startsWith(namePattern)) return 5;
  if (nameLower.includes(namePattern)) return 6;

  return Number.POSITIVE_INFINITY;
}

export function findFiles(pattern: string, files: FileInfo[]): FileInfo[] {
  if (!pattern.trim()) return files;

  return files
    .map((f) => ({
      file: f,
      score: scoreFileMatch(f.path, f.name, pattern),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.file.path.localeCompare(b.file.path);
    })
    .map((entry) => entry.file);
}

function isDirIgnoredByPatterns(
  dirRelPath: string,
  patterns: string[],
): boolean {
  for (const raw of patterns) {
    if (raw.startsWith("!")) continue;
    const p = raw.trim();
    if (!p || p.startsWith("#")) continue;
    const stripped = p.endsWith("/") ? p.slice(0, -1) : p;
    if (stripped.includes("/")) continue;
    if (matchesPart(stripped, dirRelPath.split("/").pop()!)) return true;
  }
  return false;
}

async function walkDir(
  dirPath: string,
  os: OS,
  basePath: string,
  results: string[],
  ignorePatterns: string[],
): Promise<void> {
  const normalizedBase = basePath.replace(/\\/g, "/");
  let entries: DirEnt[];
  try {
    entries = os.fs.readdir(dirPath, { withFileTypes: true }) as DirEnt[];
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryName = entry.name;
    if (entry.isDirectory()) {
      const relDir = normalizedBase ? `${normalizedBase}/${entryName}` : entryName;
      if (isExcluded(relDir)) continue;
      if (isDirIgnoredByPatterns(relDir, ignorePatterns)) continue;
      await walkDir(os.path.join(dirPath, entryName), os, relDir, results, ignorePatterns);
    } else if (entry.isFile()) {
      const relPath = normalizedBase ? `${normalizedBase}/${entryName}` : entryName;
      if (isExcluded(relPath)) continue;
      results.push(relPath);
    }
  }
}

export function createFileService(
  os: OS,
  additionalPatterns: string[] = [],
): FileService {
  return {
    listFiles: async (workspacePath: string): Promise<FileInfo[]> => {
      if (!os.fs.exists(workspacePath)) return [];
      const patterns = [
        ...additionalPatterns,
        ...loadIgnorePatterns(workspacePath, os),
      ];
      const paths: string[] = [];
      await walkDir(workspacePath, os, "", paths, patterns);
      const all = paths.map((p) => ({
        path: p,
        name: getBasename(p),
        size: 0,
      }));
      return applyIgnorePatterns(all, patterns);
    },
    readFile: async (
      workspacePath: string,
      filePath: string,
    ): Promise<string> => {
      const full = os.path.join(workspacePath, filePath).replace(/\\/g, "/");
      const base = workspacePath.replace(/\\/g, "/");
      if (!full.startsWith(base + "/") && full !== base) {
        throw new Error("Access denied: path outside workspace");
      }
      return os.fs.readFile(full, "utf-8");
    },
  };
}
