// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { join, dirname } from "path";
import { existsSync, copyFileSync, mkdirSync, unlinkSync } from "fs";
import {
  detectChangedFiles,
  type FileChange,
  type ChangedFilesResult,
  type FileChangeStatus,
} from "../files/changed-files.js";

export type { FileChange, ChangedFilesResult, FileChangeStatus };
export { detectChangedFiles };

export function applySelectedFiles(
  upstreamPath: string,
  workspacePath: string,
  selectedPaths: string[],
): { success: boolean; error?: string } {
  try {
    const selectedSet = new Set(selectedPaths);

    for (const path of selectedPaths) {
      const upstreamFile = join(upstreamPath, path);
      const workspaceFile = join(workspacePath, path);

      if (!existsSync(workspaceFile)) {
        // File deleted in workspace - delete from upstream
        if (existsSync(upstreamFile)) {
          unlinkSync(upstreamFile);
        }
      } else {
        // File added or modified - copy from workspace to upstream
        const dir = dirname(upstreamFile);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        copyFileSync(workspaceFile, upstreamFile);
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
