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

  async createFossilUser(
    repoPath: string,
    username: string,
    password: string
  ): Promise<VCSResult> {
    // Create user with DEV capabilities (d - develop, i - check-in, o - check-out)
    const result = await this.execCommand([
      "fossil",
      "user",
      "new",
      username,
      username,
      password,
      "-R",
      repoPath,
    ]);

    if (result.success) {
      // Set capabilities to DEV (d=develop, i=check-in, o=check-out)
      const capResult = await this.execCommand([
        "fossil",
        "user",
        "capabilities",
        username,
        "dio",
        "-R",
        repoPath,
      ]);

      return {
        success: capResult.success,
        output: capResult.output,
        error: capResult.error || undefined,
      };
    }

    return {
      success: false,
      output: result.output,
      error: result.error || "Failed to create user",
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
      // Import from Git to Fossil using git fast-export
      // fossil import --git creates the repo automatically
      
      // Use git fast-export piped to fossil import
      // We need to run: git fast-export --all | fossil import --git fossilPath
      const result = await new Promise<{ success: boolean; output: string; error: string }>((resolve) => {
        const { spawn } = require("child_process");
        
        const gitExport = spawn("git", ["fast-export", "--all"], { cwd: upstreamPath });
        const fossilImport = spawn("fossil", ["import", "--git", fossilPath], { cwd: upstreamPath });
        
        let stdout = "";
        let stderr = "";
        
        gitExport.stdout.pipe(fossilImport.stdin);
        
        fossilImport.stdout.on("data", (data) => {
          stdout += data.toString();
        });
        
        fossilImport.stderr.on("data", (data) => {
          stderr += data.toString();
        });
        
        gitExport.stderr.on("data", (data) => {
          stderr += data.toString();
        });
        
        fossilImport.on("close", (code) => {
          resolve({
            success: code === 0,
            output: stdout,
            error: stderr,
          });
        });
        
        gitExport.on("error", (err) => {
          fossilImport.kill();
          resolve({
            success: false,
            output: "",
            error: `Git fast-export failed: ${err.message}`,
          });
        });
      });
      
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
    targetPath: string
  ): Promise<VCSResult> {
    const { mkdirSync } = await import("fs");
    
    // Ensure target directory exists
    try {
      mkdirSync(targetPath, { recursive: true });
    } catch {
      // Directory might already exist
    }
    
    // Open the fossil repo in the target directory
    const result = await this.execCommand(
      ["fossil", "open", fossilPath],
      targetPath
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

  // New methods for commit flow

  async fossilUp(agentWorkspacePath: string): Promise<VCSResult> {
    const result = await this.execCommand(["fossil", "up"], agentWorkspacePath);
    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async cleanCopyToUpstream(
    agentWorkspacePath: string,
    upstreamPath: string
  ): Promise<VCSResult> {
    const { readdirSync, statSync, copyFileSync, mkdirSync, unlinkSync, rmdirSync } = await import("fs");
    const { join } = await import("path");

    const { existsSync: fsExistsSync } = await import("fs");
    
    try {
      // Get list of files to preserve (VCS directories)
      const preserveItems = [".git", ".fossil"];
      const itemsToPreserve: string[] = [];

      // Check what exists in upstream that we need to preserve
      if (fsExistsSync(upstreamPath)) {
        const entries = readdirSync(upstreamPath);
        for (const entry of entries) {
          if (preserveItems.includes(entry)) {
            itemsToPreserve.push(entry);
          }
        }
      }

      // Create a temporary directory to hold preserved items
      const { mkdtempSync } = await import("fs");
      const { tmpdir } = await import("os");
      const tempDir = mkdtempSync(join(tmpdir(), "mimo-preserve-"));

      // Move preserved items to temp
      for (const item of itemsToPreserve) {
        const sourcePath = join(upstreamPath, item);
        const tempPath = join(tempDir, item);
        if (statSync(sourcePath).isDirectory()) {
          // Use rename for directories
          const { renameSync } = await import("fs");
          renameSync(sourcePath, tempPath);
        } else {
          const { renameSync } = await import("fs");
          renameSync(sourcePath, tempPath);
        }
      }

      // Delete all remaining items in upstream
      const deleteRecursive = (dirPath: string) => {
        if (!fsExistsSync(dirPath)) return;
        const entries = readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          if (entry.isDirectory()) {
            deleteRecursive(fullPath);
            rmdirSync(fullPath);
          } else {
            unlinkSync(fullPath);
          }
        }
      };

      deleteRecursive(upstreamPath);

      // Ensure upstream directory exists
      if (!fsExistsSync(upstreamPath)) {
        mkdirSync(upstreamPath, { recursive: true });
      }

      // Restore preserved items
      for (const item of itemsToPreserve) {
        const tempPath = join(tempDir, item);
        const destPath = join(upstreamPath, item);
        const { renameSync } = await import("fs");
        renameSync(tempPath, destPath);
      }

      // Clean up temp directory
      rmdirSync(tempDir);

      // Copy all files from agent-workspace to upstream
      const copyRecursive = (source: string, dest: string) => {
        if (!fsExistsSync(source)) return;

        const entries = readdirSync(source, { withFileTypes: true });
        for (const entry of entries) {
          // Skip hidden files and VCS directories
          if (entry.name.startsWith(".")) continue;

          const sourcePath = join(source, entry.name);
          const destPath = join(dest, entry.name);

          if (entry.isDirectory()) {
            if (!existsSync(destPath)) {
              mkdirSync(destPath, { recursive: true });
            }
            copyRecursive(sourcePath, destPath);
          } else {
            copyFileSync(sourcePath, destPath);
          }
        }
      };

      copyRecursive(agentWorkspacePath, upstreamPath);

      return {
        success: true,
        output: "Files copied successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to copy files: ${error}`,
      };
    }
  }

  async commitUpstream(
    upstreamPath: string,
    repoType: "git" | "fossil"
  ): Promise<VCSResult> {
    const message = `Mimo commit at ${new Date().toISOString()}`;

    if (repoType === "git") {
      // Git: add all and commit
      const addResult = await this.execCommand(["git", "add", "-A"], upstreamPath);
      if (!addResult.success) {
        return {
          success: false,
          output: addResult.output,
          error: addResult.error || "Failed to stage changes",
        };
      }

      const commitResult = await this.execCommand(
        ["git", "commit", "-m", message],
        upstreamPath
      );

      // Check if nothing to commit
      if (commitResult.error?.includes("nothing to commit") || 
          commitResult.output?.includes("nothing to commit")) {
        return {
          success: true,
          output: "No changes to commit",
        };
      }

      return {
        success: commitResult.success,
        output: commitResult.output,
        error: commitResult.error || undefined,
      };
    } else {
      // Fossil: addremove and commit
      const addResult = await this.execCommand(["fossil", "addremove"], upstreamPath);
      if (!addResult.success) {
        return {
          success: false,
          output: addResult.output,
          error: addResult.error || "Failed to stage changes",
        };
      }

      const commitResult = await this.execCommand(
        ["fossil", "commit", "-m", message],
        upstreamPath
      );

      return {
        success: commitResult.success,
        output: commitResult.output,
        error: commitResult.error || undefined,
      };
    }
  }

  async pushUpstream(
    upstreamPath: string,
    repoType: "git" | "fossil",
    branch?: string
  ): Promise<VCSResult> {
    if (repoType === "git") {
      const pushArgs = branch ? ["push", "origin", branch] : ["push", "origin"];
      const result = await this.execCommand(["git", ...pushArgs], upstreamPath);

      // Check if the failure is due to no upstream branch configured
      // This is expected in test environments or new repos without remotes
      if (!result.success && 
          (result.error?.includes("no upstream branch") || 
           result.error?.includes("has no upstream branch"))) {
        return {
          success: true,
          output: "No remote configured - skipping push",
        };
      }

      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    } else {
      const result = await this.execCommand(["fossil", "push"], upstreamPath);

      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    }
  }
}

export const vcs = new VCS();
