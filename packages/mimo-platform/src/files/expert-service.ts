import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface ExpertFileResult {
  content: string;
}

export interface ExpertWriteResult {
  success: boolean;
}

export interface PatchInfo {
  originalPath: string;
  patchPath: string;
}

function isValidPath(path: string, workspacePath: string): boolean {
  if (path.includes("..")) {
    return false;
  }
  return true;
}

function isPatchPathValid(patchPath: string): boolean {
  return patchPath.startsWith(".mimo-patches/");
}

export function createExpertService(): ExpertService {
  return new ExpertService();
}

export class ExpertService {
  async readFileContent(
    workspacePath: string,
    filePath: string,
  ): Promise<ExpertFileResult> {
    if (!isValidPath(filePath, workspacePath)) {
      throw new Error("Invalid path: must be within workspace");
    }

    const fullPath = join(workspacePath, filePath).replace(/\\/g, "/");
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(fullPath, "utf-8");
    return { content };
  }

  async writeFileContent(
    workspacePath: string,
    filePath: string,
    content: string,
  ): Promise<ExpertWriteResult> {
    if (!isValidPath(filePath, workspacePath)) {
      throw new Error("Invalid path: must be within workspace");
    }

    const fullPath = join(workspacePath, filePath).replace(/\\/g, "/");
    const { writeFileSync, existsSync } = await import("fs");
    const dir = join(fullPath, "..").replace(/\\/g, "/");
    if (!existsSync(dir)) {
      throw new Error(`Directory not found: ${dir}`);
    }

    writeFileSync(fullPath, content, "utf-8");
    return { success: true };
  }

  /**
   * Approve a patch: copy patch content to original path, delete patch file
   * Note: Files are now sent directly to agent checkout via sendFileToAgent
   */
  async approvePatch(
    workspacePath: string,
    originalPath: string,
  ): Promise<ExpertWriteResult> {
    if (!isValidPath(originalPath, workspacePath)) {
      throw new Error("Invalid path: path traversal not allowed");
    }

    const { readFileSync, unlinkSync, existsSync } = await import("fs");
    const patchPath = join(".mimo-patches", originalPath).replace(/\\/g, "/");
    const fullPatchPath = join(workspacePath, patchPath).replace(/\\/g, "/");

    if (!existsSync(fullPatchPath)) {
      throw new Error(`Patch file not found: ${patchPath}`);
    }

    // Read patch content (will be sent to agent separately)
    const content = readFileSync(fullPatchPath, "utf-8");

    // Delete patch file
    unlinkSync(fullPatchPath);

    return { success: true, content };
  }

  /**
   * Write a patch file to .mimo-patches/<originalPath>
   * Creates parent directories as needed.
   */
  async writePatchFile(
    workspacePath: string,
    originalPath: string,
    content: string,
  ): Promise<{ patchPath: string }> {
    if (!isValidPath(originalPath, workspacePath)) {
      throw new Error("Invalid path: path traversal not allowed");
    }

    const { mkdirSync, writeFileSync } = await import("fs");
    const patchPath = join(".mimo-patches", originalPath).replace(/\\/g, "/");
    const fullPatchPath = join(workspacePath, patchPath).replace(/\\/g, "/");

    // Create parent directories
    const dir = join(fullPatchPath, "..").replace(/\\/g, "/");
    mkdirSync(dir, { recursive: true });

    writeFileSync(fullPatchPath, content, "utf-8");
    return { patchPath };
  }

  /**
   * Decline a patch: delete the patch file
   */
  async declinePatch(
    workspacePath: string,
    patchPath: string,
  ): Promise<ExpertWriteResult> {
    if (!isPatchPathValid(patchPath)) {
      throw new Error("Invalid patch path: must start with .mimo-patches/");
    }

    const { unlinkSync, existsSync } = await import("fs");
    const fullPatchPath = join(workspacePath, patchPath).replace(/\\/g, "/");

    if (existsSync(fullPatchPath)) {
      unlinkSync(fullPatchPath);
    }

    return { success: true };
  }

  /**
   * List all pending patch files in .mimo-patches/
   */
  async listPatchFiles(workspacePath: string): Promise<PatchInfo[]> {
    const { readdirSync, statSync } = await import("fs");
    const patchesDir = join(workspacePath, ".mimo-patches").replace(/\\/g, "/");
    
    if (!existsSync(patchesDir)) {
      return [];
    }

    const patches: PatchInfo[] = [];

    function scanDir(dir: string, prefix: string) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name).replace(/\\/g, "/");
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          scanDir(fullPath, relPath);
        } else {
          patches.push({
            originalPath: relPath,
            patchPath: `.mimo-patches/${relPath}`,
          });
        }
      }
    }

    scanDir(patchesDir, "");
    return patches;
  }
}