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

  async getStatus(workDir: string): Promise<VCSResult> {
    const result = await this.execCommand(["fossil", "changes"], workDir);
    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async commit(workDir: string, message: string): Promise<VCSResult> {
    const result = await this.execCommand(
      ["fossil", "commit", "-m", message],
      workDir
    );

    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async getCommitHistory(workDir: string, limit: number = 10): Promise<VCSResult> {
    const result = await this.execCommand(
      ["fossil", "timeline", "-n", limit.toString()],
      workDir
    );

    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async cloneRepository(
    repoUrl: string,
    repoType: "git" | "fossil",
    targetDir: string
  ): Promise<VCSResult> {
    const { mkdirSync } = await import("fs");
    
    // Ensure target directory exists
    try {
      mkdirSync(targetDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    if (repoType === "git") {
      // Clone Git repository
      const result = await this.execCommand(
        ["git", "clone", repoUrl, targetDir],
        targetDir
      );
      
      if (result.success) {
        return {
          success: true,
          output: result.output,
        };
      }
      
      // If git clone failed but directory has content, try cloning into current directory
      const result2 = await this.execCommand(
        ["git", "clone", repoUrl, "."],
        targetDir
      );
      
      return {
        success: result2.success,
        output: result2.output,
        error: result2.error || undefined,
      };
    } else {
      // Clone Fossil repository
      const result = await this.execCommand(
        ["fossil", "clone", repoUrl, `${targetDir}/.fossil`],
        targetDir
      );
      
      if (result.success) {
        // Open the cloned repo in the target directory
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
  }

  async importToFossil(
    upstreamPath: string,
    repoType: "git" | "fossil",
    fossilPath: string
  ): Promise<VCSResult> {
    if (repoType === "git") {
      // Import from Git to Fossil
      // First create the fossil repo
      const initResult = await this.createFossilRepo(fossilPath);
      if (!initResult.success) {
        return initResult;
      }
      
      // Import from git bundle or directory
      const gitDir = `${upstreamPath}/.git`;
      const result = await this.execCommand(
        ["fossil", "import", "--git", gitDir, fossilPath],
        upstreamPath
      );
      
      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    } else {
      // For fossil, clone from the upstream fossil repo
      const result = await this.execCommand(
        ["fossil", "clone", `${upstreamPath}/.fossil`, fossilPath],
        upstreamPath
      );
      
      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    }
  }

  async openFossilCheckout(
    fossilPath: string,
    checkoutPath: string
  ): Promise<VCSResult> {
    const { mkdirSync } = await import("fs");
    
    // Ensure checkout directory exists
    try {
      mkdirSync(checkoutPath, { recursive: true });
    } catch {
      // Directory might already exist
    }
    
    // Open the fossil repo in the checkout directory
    const result = await this.execCommand(
      ["fossil", "open", fossilPath],
      checkoutPath
    );
    
    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async exportFromFossil(
    fossilPath: string,
    upstreamPath: string,
    repoType: "git" | "fossil"
  ): Promise<VCSResult> {
    if (repoType === "git") {
      // Export from Fossil to Git upstream
      // Use fossil export to create a git-fast-export stream
      const result = await this.execCommand(
        ["fossil", "export", "--git", fossilPath],
        upstreamPath
      );
      
      if (result.success) {
        // Apply the export to git
        const applyResult = await this.execCommand(
          ["git", "fast-import"],
          upstreamPath
        );
        return {
          success: applyResult.success,
          output: applyResult.output,
          error: applyResult.error || undefined,
        };
      }
      
      return {
        success: false,
        output: result.output,
        error: result.error || undefined,
      };
    } else {
      // For fossil, push directly from checkout
      return {
        success: true,
        output: "Fossil repos sync directly",
      };
    }
  }

  async pushToRemote(
    upstreamPath: string,
    repoType: "git" | "fossil",
    remoteUrl?: string
  ): Promise<VCSResult> {
    if (repoType === "git") {
      const result = await this.execCommand(
        ["git", "push", "origin"],
        upstreamPath
      );
      
      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    } else {
      // Fossil push
      const args = remoteUrl ? ["push", remoteUrl] : ["push"];
      const result = await this.execCommand(
        ["fossil", ...args],
        upstreamPath
      );
      
      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    }
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
