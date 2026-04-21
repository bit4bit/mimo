import { join } from "path";
import { statSync, readFileSync } from "fs";
import crypto from "crypto";
import { VCS_INTERNALS, scanDirectory } from "../vcs/index.js";

export type FileChangeStatus = "added" | "modified" | "deleted";

export interface FileChange {
  path: string;
  status: FileChangeStatus;
  size: number;
}

export interface ChangedFilesResult {
  files: FileChange[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
  };
}

async function collectFiles(
  dirPath: string,
  basePath: string,
  fileMap: Map<string, { checksum: string; size: number }>,
): Promise<void> {
  await scanDirectory(dirPath, basePath, (fullPath, relPath) => {
    const stats = statSync(fullPath);
    // Skip directories and non-regular files (symlinks, etc.)
    if (!stats.isFile()) return;
    const content = readFileSync(fullPath);
    const checksum = crypto.createHash("md5").update(content).digest("hex");
    fileMap.set(relPath, { checksum, size: stats.size });
  });
}

export async function detectChangedFiles(
  upstreamPath: string,
  workspacePath: string,
): Promise<ChangedFilesResult> {
  const upstreamFiles = new Map<string, { checksum: string; size: number }>();
  const workspaceFiles = new Map<string, { checksum: string; size: number }>();

  await collectFiles(upstreamPath, upstreamPath, upstreamFiles);
  await collectFiles(workspacePath, workspacePath, workspaceFiles);

  const files: FileChange[] = [];
  let added = 0;
  let modified = 0;
  let deleted = 0;

  // Check workspace files
  for (const [relPath, workspaceInfo] of workspaceFiles) {
    const upstreamInfo = upstreamFiles.get(relPath);

    if (!upstreamInfo) {
      added++;
      files.push({
        path: relPath,
        status: "added",
        size: workspaceInfo.size,
      });
    } else if (upstreamInfo.checksum !== workspaceInfo.checksum) {
      modified++;
      files.push({
        path: relPath,
        status: "modified",
        size: workspaceInfo.size,
      });
    }
  }

  // Check for deleted files
  for (const [relPath, upstreamInfo] of upstreamFiles) {
    if (!workspaceFiles.has(relPath)) {
      deleted++;
      files.push({
        path: relPath,
        status: "deleted",
        size: upstreamInfo.size,
      });
    }
  }

  return {
    files,
    summary: { added, modified, deleted },
  };
}
