import { join, relative } from "path";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import crypto from "crypto";

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

function scanDirectory(
  dirPath: string,
  basePath: string,
  fileMap: Map<string, { checksum: string; size: number }>,
): void {
  if (!existsSync(dirPath)) return;

  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relPath = relative(basePath, fullPath);

    // Skip hidden files and directories
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      scanDirectory(fullPath, basePath, fileMap);
    } else {
      const stats = statSync(fullPath);
      const content = readFileSync(fullPath);
      const checksum = crypto.createHash("md5").update(content).digest("hex");

      fileMap.set(relPath, { checksum, size: stats.size });
    }
  }
}

export function detectChangedFiles(
  upstreamPath: string,
  workspacePath: string,
): ChangedFilesResult {
  const upstreamFiles = new Map<string, { checksum: string; size: number }>();
  const workspaceFiles = new Map<string, { checksum: string; size: number }>();

  scanDirectory(upstreamPath, upstreamPath, upstreamFiles);
  scanDirectory(workspacePath, workspacePath, workspaceFiles);

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
