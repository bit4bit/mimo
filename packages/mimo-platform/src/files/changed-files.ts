import type { OS } from "../os/types.js";
import crypto from "crypto";
import { VCS_INTERNALS, scanDirectory } from "../vcs/index.js";
import { logger } from "../logger.js";

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
  os: OS,
  dirPath: string,
  basePath: string,
  fileMap: Map<string, { checksum: string; size: number }>,
  fileFilter?: (relPath: string) => boolean,
): Promise<void> {
  let scanned = 0;
  let included = 0;

  await scanDirectory(os, dirPath, basePath, (fullPath, relPath) => {
    scanned++;

    if (fileFilter && !fileFilter(relPath)) {
      return;
    }

    const stats = os.fs.stat(fullPath);
    // Skip directories and non-regular files (symlinks, etc.)
    if (!stats.isFile()) return;
    const content = os.fs.readFile(fullPath);
    const checksum = crypto.createHash("md5").update(content).digest("hex");
    fileMap.set(relPath, { checksum, size: stats.size });
    included++;
  });

  logger.debug(
    `[files:scan] dir=${dirPath} scanned=${scanned} included=${included}`,
  );
}

export async function detectChangedFiles(
  os: OS,
  upstreamPath: string,
  workspacePath: string,
  options?: {
    fileFilter?: (relPath: string) => boolean;
  },
): Promise<ChangedFilesResult> {
  const upstreamFiles = new Map<string, { checksum: string; size: number }>();
  const workspaceFiles = new Map<string, { checksum: string; size: number }>();

  await collectFiles(
    os,
    upstreamPath,
    upstreamPath,
    upstreamFiles,
    options?.fileFilter,
  );
  await collectFiles(
    os,
    workspacePath,
    workspacePath,
    workspaceFiles,
    options?.fileFilter,
  );

  logger.debug(
    `[files:compare] upstream=${upstreamFiles.size} workspace=${workspaceFiles.size}`,
  );

  const files: FileChange[] = [];
  let added = 0;
  let modified = 0;
  let deleted = 0;

  // Files in workspace but not in upstream = added
  for (const [path, workspaceData] of workspaceFiles) {
    if (!upstreamFiles.has(path)) {
      files.push({ path, status: "added", size: workspaceData.size });
      logger.debug(
        `[files:detail] path=${path} status=added checksum=${workspaceData.checksum.slice(0, 8)} size=${workspaceData.size}`,
      );
      added++;
    } else if (upstreamFiles.get(path)!.checksum !== workspaceData.checksum) {
      files.push({ path, status: "modified", size: workspaceData.size });
      logger.debug(
        `[files:detail] path=${path} status=modified checksum=${workspaceData.checksum.slice(0, 8)} size=${workspaceData.size}`,
      );
      modified++;
    }
  }

  // Files in upstream but not in workspace = deleted
  for (const [path, upstreamData] of upstreamFiles) {
    if (!workspaceFiles.has(path)) {
      files.push({ path, status: "deleted", size: upstreamData.size });
      logger.debug(
        `[files:detail] path=${path} status=deleted checksum=${upstreamData.checksum.slice(0, 8)} size=${upstreamData.size}`,
      );
      deleted++;
    }
  }

  logger.debug(
    `[files:result] added=${added} modified=${modified} deleted=${deleted}`,
  );

  return {
    files,
    summary: { added, modified, deleted },
  };
}
