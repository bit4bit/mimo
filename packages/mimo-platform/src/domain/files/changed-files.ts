// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import { scanDirectory } from "../vcs/index.js";
import { logger } from "../../logger.js";
import type { ManifestStore, TreeManifest } from "./tree-manifest.js";
import { hashContent } from "./tree-manifest.js";

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

interface FileHashEntry {
  size: number;
  hash: string;
  readContent: boolean;
}

/**
 * Build a fresh `path → { size, hash }` map for one side of the comparison,
 * reusing cached hashes from the manifest when size and mtime match.
 * Deleted entries naturally drop out because the map is built from the live
 * scan. The updated manifest is returned alongside the hash map.
 */
async function collectHashes(
  os: OS,
  dirPath: string,
  oldManifest: TreeManifest,
  fileFilter?: (relPath: string) => boolean,
): Promise<{
  hashes: Map<string, FileHashEntry>;
  manifest: TreeManifest;
}> {
  const hashes = new Map<string, FileHashEntry>();
  const manifest: TreeManifest = {};

  await scanDirectory(os, dirPath, dirPath, async (fullPath, relPath) => {
    if (fileFilter && !fileFilter(relPath)) return;
    const stats = await os.fs.statAsync(fullPath);
    if (!stats.isFile()) return;

    const cached = oldManifest[relPath];
    let hash: string;
    let readContent = false;
    const cacheHit =
      cached && cached.size === stats.size && cached.mtime === stats.mtimeMs;
    if (cacheHit) {
      // Stat cache hit: reuse stored hash without reading content.
      hash = cached.hash;
      readContent = true; // The hash came from previously-read content.
    } else {
      // No usable cache: read and hash the file. With no manifest this is the
      // legacy behavior; with a manifest it rebuilds the entry for changed files.
      hash = hashContent(await os.fs.readFileAsync(fullPath));
      readContent = true;
    }

    hashes.set(relPath, { size: stats.size, hash, readContent });
    manifest[relPath] = { size: stats.size, mtime: stats.mtimeMs, hash };
  });

  return { hashes, manifest };
}

/**
 * Detect the changes that committing would introduce upstream: the delta
 * between the upstream checkout and the agent workspace (two independent
 * working trees). Size-first — content is read only to disambiguate paths
 * present on both sides with equal size. When a `manifestStore` is supplied,
 * hashes are cached per tree by `{ size, mtime }` and persisted across
 * invocations so unchanged files are not re-read.
 */
export async function detectChangedFiles(
  os: OS,
  upstreamPath: string,
  workspacePath: string,
  options?: {
    fileFilter?: (relPath: string) => boolean;
  },
  manifestStore?: ManifestStore,
): Promise<ChangedFilesResult> {
  const [upstreamOldManifest, workspaceOldManifest] = await Promise.all([
    manifestStore?.load(upstreamPath) ?? Promise.resolve({}),
    manifestStore?.load(workspacePath) ?? Promise.resolve({}),
  ]);

  const [
    { hashes: upstreamHashes, manifest: upstreamManifest },
    { hashes: workspaceHashes, manifest: workspaceManifest },
  ] = await Promise.all([
    collectHashes(os, upstreamPath, upstreamOldManifest, options?.fileFilter),
    collectHashes(os, workspacePath, workspaceOldManifest, options?.fileFilter),
  ]);

  if (manifestStore) {
    await Promise.all([
      manifestStore.save(upstreamPath, upstreamManifest),
      manifestStore.save(workspacePath, workspaceManifest),
    ]);
  }

  logger.debug(
    `[files:compare] upstream=${upstreamHashes.size} workspace=${workspaceHashes.size}`,
  );

  const files: FileChange[] = [];
  let added = 0;
  let modified = 0;
  let deleted = 0;

  for (const [path, workspaceEntry] of workspaceHashes) {
    if (!upstreamHashes.has(path)) {
      files.push({ path, status: "added", size: workspaceEntry.size });
      added++;
      continue;
    }

    const upstreamEntry = upstreamHashes.get(path)!;
    let isModified = upstreamEntry.size !== workspaceEntry.size;
    if (!isModified) {
      // Equal size: the only case that requires comparing content. If either
      // side has not yet read its content this scan, read it now and hash it.
      if (!upstreamEntry.readContent || !workspaceEntry.readContent) {
        const [a, b] = await Promise.all([
          os.fs.readFileAsync(os.path.join(upstreamPath, path)),
          os.fs.readFileAsync(os.path.join(workspacePath, path)),
        ]);
        if (!upstreamEntry.readContent) upstreamEntry.hash = hashContent(a);
        if (!workspaceEntry.readContent) workspaceEntry.hash = hashContent(b);
      }
      isModified = upstreamEntry.hash !== workspaceEntry.hash;
    }

    if (isModified) {
      files.push({ path, status: "modified", size: workspaceEntry.size });
      modified++;
    }
  }

  // Files in upstream but not in workspace = deleted
  for (const [path, upstreamEntry] of upstreamHashes) {
    if (!workspaceHashes.has(path)) {
      files.push({ path, status: "deleted", size: upstreamEntry.size });
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
