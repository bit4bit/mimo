import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join, relative, basename } from "path";
import type { FileInfo, FileService } from "./types.js";

export function matchesPattern(filePath: string, pattern: string): boolean {
  if (!pattern.trim()) return true;
  const lower = filePath.toLowerCase();
  const pat = pattern.toLowerCase().trim();
  return lower.includes(pat);
}

export function findFiles(
  pattern: string,
  files: FileInfo[],
): FileInfo[] {
  return files.filter((f) => matchesPattern(f.name, pattern));
}

function collectFiles(
  dir: string,
  workspacePath: string,
  results: FileInfo[],
  depth: number,
): void {
  if (depth > 10) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      collectFiles(full, workspacePath, results, depth + 1);
    } else if (stat.isFile()) {
      results.push({
        path: relative(workspacePath, full),
        name: basename(full),
        size: stat.size,
      });
    }
  }
}

export function createFileService(): FileService {
  return {
    listFiles: async (workspacePath: string): Promise<FileInfo[]> => {
      if (!existsSync(workspacePath)) return [];
      const results: FileInfo[] = [];
      collectFiles(workspacePath, workspacePath, results, 0);
      return results;
    },
    readFile: async (workspacePath: string, filePath: string): Promise<string> => {
      const full = join(workspacePath, filePath);
      // Prevent path traversal: resolved path must be inside workspacePath
      const resolved = full.replace(/\\/g, "/");
      const base = workspacePath.replace(/\\/g, "/");
      if (!resolved.startsWith(base + "/") && resolved !== base) {
        throw new Error("Access denied: path outside workspace");
      }
      return readFileSync(full, "utf-8");
    },
  };
}
