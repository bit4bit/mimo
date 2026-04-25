import type { OS } from "../os/types.js";

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

function isValidPath(path: string, _workspacePath: string): boolean {
  if (path.includes("..")) {
    return false;
  }
  return true;
}

function isPatchPathValid(patchPath: string): boolean {
  return patchPath.startsWith(".mimo-patches/");
}

export function createExpertService(os: OS): ExpertService {
  return new ExpertService(os);
}

export class ExpertService {
  private os: OS;

  constructor(os: OS) {
    this.os = os;
  }

  async readFileContent(
    workspacePath: string,
    filePath: string,
  ): Promise<ExpertFileResult> {
    if (!isValidPath(filePath, workspacePath)) {
      throw new Error("Invalid path: must be within workspace");
    }

    const fullPath = this.os.path
      .join(workspacePath, filePath)
      .replace(/\\/g, "/");
    if (!this.os.fs.exists(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = this.os.fs.readFile(fullPath, "utf-8");
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

    const fullPath = this.os.path
      .join(workspacePath, filePath)
      .replace(/\\/g, "/");
    const dir = this.os.path.dirname(fullPath);
    if (!this.os.fs.exists(dir)) {
      throw new Error(`Directory not found: ${dir}`);
    }

    this.os.fs.writeFile(fullPath, content, "utf-8");
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

    const patchPath = this.os.path
      .join(".mimo-patches", originalPath)
      .replace(/\\/g, "/");
    const fullPatchPath = this.os.path
      .join(workspacePath, patchPath)
      .replace(/\\/g, "/");

    if (!this.os.fs.exists(fullPatchPath)) {
      throw new Error(`Patch file not found: ${patchPath}`);
    }

    // Read patch content (will be sent to agent separately)
    const content = this.os.fs.readFile(fullPatchPath, "utf-8");

    // Delete patch file
    this.os.fs.unlink(fullPatchPath);

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

    const patchPath = this.os.path
      .join(".mimo-patches", originalPath)
      .replace(/\\/g, "/");
    const fullPatchPath = this.os.path
      .join(workspacePath, patchPath)
      .replace(/\\/g, "/");

    // Create parent directories
    const dir = this.os.path.dirname(fullPatchPath);
    this.os.fs.mkdir(dir, { recursive: true });

    this.os.fs.writeFile(fullPatchPath, content, "utf-8");
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

    const fullPatchPath = this.os.path
      .join(workspacePath, patchPath)
      .replace(/\\/g, "/");

    if (this.os.fs.exists(fullPatchPath)) {
      this.os.fs.unlink(fullPatchPath);
    }

    return { success: true };
  }

  /**
   * List all pending patch files in .mimo-patches/
   */
  async listPatchFiles(workspacePath: string): Promise<PatchInfo[]> {
    const patchesDir = this.os.path
      .join(workspacePath, ".mimo-patches")
      .replace(/\\/g, "/");

    if (!this.os.fs.exists(patchesDir)) {
      return [];
    }

    const patches: PatchInfo[] = [];

    const scanDir = (dir: string, prefix: string) => {
      const entries = this.os.fs.readdir(dir, {
        withFileTypes: true,
      }) as Array<{
        name: string;
        isDirectory(): boolean;
        isFile(): boolean;
      }>;
      for (const entry of entries) {
        const fullPath = this.os.path.join(dir, entry.name).replace(/\\/g, "/");
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
    };

    scanDir(patchesDir, "");
    return patches;
  }
}
