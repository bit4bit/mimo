import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import type { FileInfo, FileService } from "./types.js";

const DEFAULT_IGNORE_PATTERNS: string[] = [".mimo-patches/"];

export function loadIgnorePatterns(workspacePath: string): string[] {
  const files = [".gitignore", ".mimoignore"];
  const patterns: string[] = [...DEFAULT_IGNORE_PATTERNS];
  for (const name of files) {
    const fullPath = join(workspacePath, name);
    if (!existsSync(fullPath)) continue;
    try {
      const lines = readFileSync(fullPath, "utf-8").split("\n");
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

function basename(path: string): string {
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

  const namePattern = basename(normalizedPattern);

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

async function fossilLs(workspacePath: string): Promise<string[]> {
  const proc = Bun.spawn(["fossil", "ls"], {
    cwd: workspacePath,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  const output = await new Response(proc.stdout).text();
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function createFileService(
  additionalPatterns: string[] = [],
): FileService {
  return {
    listFiles: async (workspacePath: string): Promise<FileInfo[]> => {
      if (!existsSync(workspacePath)) return [];
      const paths = await fossilLs(workspacePath);
      const all = paths.map((p) => ({
        path: p,
        name: basename(p),
        size: 0,
      }));
      const patterns = [
        ...DEFAULT_IGNORE_PATTERNS,
        ...additionalPatterns,
        ...loadIgnorePatterns(workspacePath),
      ];
      return applyIgnorePatterns(all, patterns);
    },
    readFile: async (
      workspacePath: string,
      filePath: string,
    ): Promise<string> => {
      const full = join(workspacePath, filePath).replace(/\\/g, "/");
      const base = workspacePath.replace(/\\/g, "/");
      if (!full.startsWith(base + "/") && full !== base) {
        throw new Error("Access denied: path outside workspace");
      }
      return readFileSync(full, "utf-8");
    },
  };
}
