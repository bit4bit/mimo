import type { OS } from "../os/types.js";
import {
  detectChangedFiles,
  type FileChange,
  type ChangedFilesResult,
  type FileChangeStatus,
} from "../files/changed-files.js";

export type { FileChange, ChangedFilesResult, FileChangeStatus };
export { detectChangedFiles };

export function applySelectedFiles(
  os: OS,
  upstreamPath: string,
  workspacePath: string,
  selectedPaths: string[],
): { success: boolean; error?: string } {
  try {
    const selectedSet = new Set(selectedPaths);

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
