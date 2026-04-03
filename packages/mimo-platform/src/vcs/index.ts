export interface VCSResult {
  success: boolean;
  output?: string;
  error?: string;
  port?: number;
}

export class VCS {
  private async execCommand(
    command: string[],
    cwd?: string
  ): Promise<{ success: boolean; output: string; error: string }> {
    const proc = Bun.spawn(command, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return {
      success: exitCode === 0,
      output: stdout.trim(),
      error: stderr.trim(),
    };
  }

  async checkFossilAvailable(): Promise<boolean> {
    const result = await this.execCommand(["fossil", "version"]);
    return result.success;
  }

  async getFossilVersion(): Promise<string | null> {
    const result = await this.execCommand(["fossil", "version"]);
    if (result.success) {
      const match = result.output.match(/(\d+\.\d+)/);
      return match ? match[1] : null;
    }
    return null;
  }

  async createFossilRepo(repoPath: string): Promise<VCSResult> {
    const result = await this.execCommand(["fossil", "init", repoPath]);
    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async openFossil(repoPath: string, workDir: string): Promise<VCSResult> {
    const result = await this.execCommand(
      ["fossil", "open", repoPath],
      workDir
    );
    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async importGitToFossil(gitUrl: string, workDir: string): Promise<VCSResult> {
    try {
      new URL(gitUrl);
    } catch {
      return {
        success: false,
        error: "Invalid Git URL format",
      };
    }

    // Create fossil repo first
    const fossilPath = `${workDir}/.fossil`;
    const initResult = await this.createFossilRepo(fossilPath);
    if (!initResult.success) {
      return initResult;
    }

    // Import from git
    const result = await this.execCommand(
      ["fossil", "import", "--git", gitUrl, fossilPath],
      workDir
    );

    if (result.success) {
      // Open the fossil repo in the workdir
      const openResult = await this.openFossil(fossilPath, workDir);
      return openResult;
    }

    return {
      success: false,
      output: result.output,
      error: result.error || "Failed to import from Git",
    };
  }

  async cloneFossil(
    sourcePath: string,
    targetDir: string
  ): Promise<VCSResult> {
    const { mkdirSync } = await import("fs");
    const { dirname } = await import("path");

    // Ensure target directory exists
    try {
      mkdirSync(targetDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Clone the fossil repo
    const result = await this.execCommand([
      "fossil",
      "clone",
      sourcePath,
      `${targetDir}/.fossil`,
    ]);

    if (result.success) {
      // Open the cloned repo
      const openResult = await this.openFossil(
        `${targetDir}/.fossil`,
        targetDir
      );
      return openResult;
    }

    return {
      success: false,
      output: result.output,
      error: result.error || "Failed to clone Fossil repository",
    };
  }

  async sync(
    workDir: string,
    direction: "pull" | "push"
  ): Promise<VCSResult> {
    const command = direction === "pull" ? "pull" : "push";
    const result = await this.execCommand(["fossil", command], workDir);

    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async setupSessionWorktree(
    projectId: string,
    sessionId: string,
    worktreePath: string
  ): Promise<VCSResult> {
    const { getProjectPath } = await import("../config/paths.js");
    const projectPath = getProjectPath(projectId);
    const fossilPath = `${projectPath}/repo.fossil`;

    // Ensure worktree directory exists
    const { mkdirSync } = await import("fs");
    try {
      mkdirSync(worktreePath, { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Check if fossil repo exists
    const { existsSync } = await import("fs");
    if (!existsSync(fossilPath)) {
      return {
        success: false,
        error: "Project fossil repository not found",
      };
    }

    // Open the fossil repo in the worktree
    return await this.openFossil(fossilPath, worktreePath);
  }
}

export const vcs = new VCS();
