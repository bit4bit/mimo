// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import {
  detectChangedFiles,
  type FileChange,
  type ChangedFilesResult,
  type FileChangeStatus,
} from "../files/changed-files.js";
import { parsePatchPreview, type PatchPreview } from "./patch-preview.js";

export type { FileChange, ChangedFilesResult, FileChangeStatus };
export { detectChangedFiles };

export function applySelectedFiles(
  os: OS,
  upstreamPath: string,
  workspacePath: string,
  selectedPaths: string[],
): { success: boolean; error?: string } {
  try {
    for (const path of selectedPaths) {
      const upstreamFile = os.path.join(upstreamPath, path);
      const workspaceFile = os.path.join(workspacePath, path);

      if (!os.fs.exists(workspaceFile)) {
        // File deleted in workspace - delete from upstream
        if (os.fs.exists(upstreamFile)) {
          os.fs.unlink(upstreamFile);
        }
      } else {
        // File added or modified - copy from workspace to upstream
        const dir = os.path.dirname(upstreamFile);
        if (!os.fs.exists(dir)) {
          os.fs.mkdir(dir, { recursive: true });
        }
        os.fs.copyFile(workspaceFile, upstreamFile);
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Async variant of applySelectedFiles. Copies/deletes the selected files from
 * the workspace to upstream without blocking the event loop on each file.
 */
export async function applySelectedFilesAsync(
  os: OS,
  upstreamPath: string,
  workspacePath: string,
  selectedPaths: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    for (const path of selectedPaths) {
      const upstreamFile = os.path.join(upstreamPath, path);
      const workspaceFile = os.path.join(workspacePath, path);

      const workspaceExists = await os.fs.existsAsync(workspaceFile);
      if (!workspaceExists) {
        const upstreamExists = await os.fs.existsAsync(upstreamFile);
        if (upstreamExists) {
          await os.fs.unlinkAsync(upstreamFile);
        }
      } else {
        const dir = os.path.dirname(upstreamFile);
        const dirExists = await os.fs.existsAsync(dir);
        if (!dirExists) {
          await os.fs.mkdirAsync(dir, { recursive: true });
        }
        await os.fs.copyFileAsync(workspaceFile, upstreamFile);
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Derive the changed-file list from an already-generated patch preview.
 * Avoids re-scanning both directories and recomputing MD5 checksums,
 * which is the main bottleneck for large repositories.
 */
export function detectChangedFilesFromPatchPreview(
  os: OS,
  upstreamPath: string,
  workspacePath: string,
  patchPreview: PatchPreview,
): ChangedFilesResult {
  const files: FileChange[] = [];

  for (const patchFile of patchPreview.files) {
    let size = 0;
    if (patchFile.status === "deleted") {
      const upstreamFile = os.path.join(upstreamPath, patchFile.path);
      if (os.fs.exists(upstreamFile)) {
        size = os.fs.stat(upstreamFile).size;
      }
    } else {
      const workspaceFile = os.path.join(workspacePath, patchFile.path);
      if (os.fs.exists(workspaceFile)) {
        size = os.fs.stat(workspaceFile).size;
      }
    }

    files.push({
      path: patchFile.path,
      status: patchFile.status,
      size,
    });
  }

  return {
    files,
    summary: {
      added: files.filter((f) => f.status === "added").length,
      modified: files.filter((f) => f.status === "modified").length,
      deleted: files.filter((f) => f.status === "deleted").length,
    },
  };
}

/**
 * Parse a raw unified diff patch and extract changed files with sizes.
 * Convenience wrapper around parsePatchPreview and detectChangedFilesFromPatchPreview.
 */
export function detectChangedFilesFromPatch(
  os: OS,
  upstreamPath: string,
  workspacePath: string,
  patch: string,
): ChangedFilesResult {
  const patchPreview = parsePatchPreview(patch);
  return detectChangedFilesFromPatchPreview(
    os,
    upstreamPath,
    workspacePath,
    patchPreview,
  );
}
