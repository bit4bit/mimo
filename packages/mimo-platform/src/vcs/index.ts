// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import {
  writeFileSync,
  chmodSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  readFileSync,
  lstatSync,
} from "fs";
import { tmpdir } from "os";
import { join, dirname, basename } from "path";
import type { Credential } from "../credentials/repository";
import { logger } from "../logger.js";

export interface VCSResult {
  success: boolean;
  output?: string;
  error?: string;
  port?: number;
}

/**
 * VCS internal directories/files that must never be tracked as changes.
 * These are excluded from file scanning and change detection.
 */
export const VCS_INTERNALS = new Set([
  ".fossil",
  ".fslckout",
  ".fossil-settings",
  ".git",
]);

/**
 * VCS metadata files that must never be committed, regardless of repo type.
 * These are actively removed before addremove/commit operations.
 */
export const VCS_METADATA = [".fslckout", "_FOSSIL_", ".fslckout-journal"];

/**
 * Scan a directory recursively, calling a callback for each non-VCS file.
 * Skips VCS internal directories (VCS_INTERNALS) automatically.
 *
 * @param dirPath - The directory to scan
 * @param basePath - The base path for computing relative paths
 * @param callback - Called for each file with (fullPath, relPath)
 */
export async function scanDirectory(
  dirPath: string,
  basePath: string,
  callback: (fullPath: string, relPath: string) => void | Promise<void>,
): Promise<void> {
  const { existsSync, readdirSync } = await import("fs");
  const { join, relative } = await import("path");

  if (!existsSync(dirPath)) return;

  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relPath = relative(basePath, fullPath);

    if (VCS_INTERNALS.has(entry.name)) continue;

    const entryStats = lstatSync(fullPath);
    if (entryStats.isDirectory()) {
      await scanDirectory(fullPath, basePath, callback);
    } else if (entryStats.isFile()) {
      await callback(fullPath, relPath);
    }
  }
}

export class VCS {
  private async execCommand(
    command: string[],
    cwd?: string,
    env?: Record<string, string>,
  ): Promise<{ success: boolean; output: string; error: string }> {
    const proc = Bun.spawn(command, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: env ? { ...process.env, ...env } : undefined,
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

  // Helper to inject HTTPS credentials into URL
  private injectHttpsCredentials(
    repoUrl: string,
    credential: Extract<Credential, { type: "https" }>,
  ): string {
    try {
      const url = new URL(repoUrl);
      url.username = encodeURIComponent(credential.username);
      url.password = encodeURIComponent(credential.password);
      return url.toString();
    } catch {
      // If URL parsing fails, assume it's SSH format and return as-is
      return repoUrl;
    }
  }

  // Helper to create temporary SSH key file
  private createTempSshKeyFile(privateKey: string): string {
    const tempDir = tmpdir();
    const keyFile = join(
      tempDir,
      `mimo-ssh-key-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    writeFileSync(keyFile, privateKey, { mode: 0o600 });
    chmodSync(keyFile, 0o600);
    return keyFile;
  }

  // Helper to delete temporary SSH key file
  private deleteTempSshKeyFile(keyPath: string): void {
    try {
      unlinkSync(keyPath);
    } catch {
      // Ignore errors during cleanup
    }
  }

  // Helper to build SSH command for GIT_SSH_COMMAND
  private buildGitSshCommand(keyPath: string): string {
    return `ssh -i "${keyPath}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
  }

  // Helper to detect if URL is SSH
  private isSshUrl(url: string): boolean {
    return url.startsWith("git@") || url.startsWith("ssh://");
  }

  // Helper to check if error is authentication-related
  private isAuthError(error: string, type: "https" | "ssh"): boolean {
    const lowerError = error.toLowerCase();

    // Exclude network errors first
    if (
      lowerError.includes("timeout") ||
      lowerError.includes("could not resolve") ||
      lowerError.includes("network is unreachable") ||
      lowerError.includes("no route to host")
    ) {
      return false;
    }

    if (type === "https") {
      return (
        lowerError.includes("authentication failed") ||
        lowerError.includes("403") ||
        lowerError.includes("401") ||
        lowerError.includes("unauthorized")
      );
    } else {
      return (
        lowerError.includes("permission denied") ||
        lowerError.includes("publickey") ||
        lowerError.includes("authentication") ||
        lowerError.includes("host key verification failed")
      );
    }
  }

  // Helper to safely move files across filesystems (handles EXDEV error)
  // When rename fails due to cross-device link, falls back to copy+delete
  private async safeMove(
    sourcePath: string,
    destPath: string,
    isDirectory: boolean,
  ): Promise<void> {
    const { renameSync, cpSync, rmSync, mkdirSync, existsSync, readdirSync } =
      await import("fs");
    const { dirname, join } = await import("path");

    try {
      // Try rename first (fastest for same filesystem)
      renameSync(sourcePath, destPath);
    } catch (error: any) {
      // If error is cross-device link, fall back to copy+delete
      if (error.code === "EXDEV" || error.message?.includes("cross-device")) {
        // Ensure parent directory exists for destination
        const parentDir = dirname(destPath);
        mkdirSync(parentDir, { recursive: true });

        if (isDirectory) {
          // Use cpSync with recursive and preserveTimestamps to properly copy .git
          cpSync(sourcePath, destPath, {
            recursive: true,
            preserveTimestamps: true,
            filter: () => true, // Copy all files including hidden ones
          });
          // Verify copy succeeded before deleting source
          if (!existsSync(destPath)) {
            throw new Error(
              `Failed to copy directory from ${sourcePath} to ${destPath}`,
            );
          }
          // Delete source directory recursively
          rmSync(sourcePath, { recursive: true, force: true });
        } else {
          // Use cpSync for files too to preserve permissions
          cpSync(sourcePath, destPath, { preserveTimestamps: true });
          if (!existsSync(destPath)) {
            throw new Error(
              `Failed to copy file from ${sourcePath} to ${destPath}`,
            );
          }
          rmSync(sourcePath, { force: true });
        }
      } else {
        // Re-throw other errors
        throw error;
      }
    }
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

  async createBranch(
    branchName: string,
    repoType: "git" | "fossil",
    upstreamPath: string,
  ): Promise<VCSResult> {
    if (repoType === "git") {
      const result = await this.execCommand(
        ["git", "checkout", "-B", branchName],
        upstreamPath,
      );
      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    } else {
      const result = await this.execCommand(
        ["fossil", "branch", "new", branchName, "current"],
        upstreamPath,
      );
      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    }
  }

  async createFossilUser(
    repoPath: string,
    username: string,
    password: string,
    capabilities: string = "dio",
  ): Promise<VCSResult> {
    // Create user in repository (if it already exists we'll update it below)
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

    const userAlreadyExists = result.error
      .toLowerCase()
      .includes("already exists");

    if (!result.success && !userAlreadyExists) {
      return {
        success: false,
        output: result.output,
        error: result.error || "Failed to create user",
      };
    }

    // Always ensure password is updated to requested value
    const passwordResult = await this.execCommand([
      "fossil",
      "user",
      "password",
      username,
      password,
      "-R",
      repoPath,
    ]);

    if (!passwordResult.success) {
      return {
        success: false,
        output: passwordResult.output,
        error: passwordResult.error || "Failed to set user password",
      };
    }

    // Ensure capabilities match expected role
    const capResult = await this.execCommand([
      "fossil",
      "user",
      "capabilities",
      username,
      capabilities,
      "-R",
      repoPath,
    ]);

    return {
      success: capResult.success,
      output: [result.output, passwordResult.output, capResult.output]
        .filter(Boolean)
        .join("\n"),
      error: capResult.error || undefined,
    };
  }

  /**
   * Create a user in a fossil repository via the HTTP remote interface.
   * This requires the fossil server to be running.
   *
   * @param sessionId - The session ID (used to construct the URL)
   * @param username - The new username to create
   * @param password - The new user's password
   * @param port - The port the fossil server is running on
   * @param setupUser - The setup/admin username for authentication
   * @param setupPassword - The setup/admin password for authentication
   */
  async createFossilUserInRepo(
    sessionId: string,
    username: string,
    password: string,
    port: number,
    setupUser: string,
    setupPassword: string,
  ): Promise<VCSResult> {
    const normalizedId = sessionId.replace(/-/g, "_");
    const url = `http://${encodeURIComponent(setupUser)}:${encodeURIComponent(setupPassword)}@localhost:${port}/${normalizedId}`;

    // Use fossil remote-url command to create a user
    const result = await this.execCommand([
      "fossil",
      "remote-url",
      url,
      "-R",
      ":memory:", // Use in-memory repo for the operation
      "--user",
      username,
      "--password",
      password,
    ]);

    // The fossil remote-url command doesn't have a direct user creation option
    // Instead, we need to use the HTTP JSON API
    try {
      const response = await fetch(
        `http://localhost:${port}/${normalizedId}/json/user/new`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${btoa(`${setupUser}:${setupPassword}`)}`,
          },
          body: JSON.stringify({
            user: username,
            password: password,
            capabilities: "dio", // develop, check-in, check-out
          }),
        },
      );

      if (response.ok) {
        return { success: true };
      } else {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async setFossilProjectName(
    fossilPath: string,
    name: string,
  ): Promise<VCSResult> {
    // project-name is not a regular setting, must use SQL to set it
    const escapedName = name.replace(/'/g, "''");
    const result = await this.execCommand([
      "fossil",
      "sql",
      "-R",
      fossilPath,
      `INSERT OR REPLACE INTO config(name, value, mtime) VALUES('project-name', '${escapedName}', unixepoch())`,
    ]);
    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async openFossil(repoPath: string, workDir: string): Promise<VCSResult> {
    const result = await this.execCommand(
      ["fossil", "open", repoPath],
      workDir,
    );
    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async syncIgnoresToFossil(
    upstreamPath: string,
    agentWorkspacePath: string,
  ): Promise<VCSResult> {
    const { existsSync, readFileSync, mkdirSync, writeFileSync } =
      await import("fs");
    const { join } = await import("path");

    const parsePatterns = (filePath: string): string[] =>
      existsSync(filePath)
        ? readFileSync(filePath, "utf8")
            .split("\n")
            .map((line: string) => line.trim())
            .filter((line: string) => line.length > 0 && !line.startsWith("#"))
        : [];

    const patterns = [
      ...parsePatterns(join(upstreamPath, ".gitignore")),
      ...parsePatterns(join(upstreamPath, ".mimoignore")),
    ];

    if (patterns.length === 0) {
      return {
        success: true,
        output: "No patterns found in .gitignore or .mimoignore, skipping",
      };
    }

    // Write .fossil-settings/ignore-glob
    const fossilSettingsDir = join(agentWorkspacePath, ".fossil-settings");
    if (!existsSync(fossilSettingsDir)) {
      mkdirSync(fossilSettingsDir, { recursive: true });
    }
    writeFileSync(
      join(fossilSettingsDir, "ignore-glob"),
      patterns.join("\n") + "\n",
    );

    // Commit into fossil checkout — use explicit add since fossil addremove
    // skips .fossil-settings/ as a special directory
    const addResult = await this.execCommand(
      ["fossil", "add", ".fossil-settings/ignore-glob"],
      agentWorkspacePath,
    );
    if (!addResult.success) {
      return { success: false, error: `fossil add failed: ${addResult.error}` };
    }

    const commitResult = await this.execCommand(
      [
        "fossil",
        "commit",
        "-m",
        "Setup ignore-glob from .gitignore and .mimoignore",
        "--no-warnings",
      ],
      agentWorkspacePath,
    );

    return {
      success: commitResult.success,
      output: commitResult.output,
      error: commitResult.error || undefined,
    };
  }

  async importGitToFossil(
    gitUrl: string,
    workDir: string,
    credential?: Credential,
  ): Promise<VCSResult> {
    let url = gitUrl;

    // Inject credentials if provided and HTTPS
    if (credential?.type === "https" && !this.isSshUrl(gitUrl)) {
      url = this.injectHttpsCredentials(gitUrl, credential);
    }

    try {
      new URL(url);
    } catch {
      // Allow SSH URLs
      if (!this.isSshUrl(url)) {
        return {
          success: false,
          error: "Invalid Git URL format",
        };
      }
    }

    // Create fossil repo first
    const fossilPath = `${workDir}/.fossil`;
    const initResult = await this.createFossilRepo(fossilPath);
    if (!initResult.success) {
      return initResult;
    }

    // Import from git
    const result = await this.execCommand(
      ["fossil", "import", "--git", url, fossilPath],
      workDir,
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

  async cloneFossil(sourcePath: string, targetDir: string): Promise<VCSResult> {
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
        targetDir,
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
    direction: "pull" | "push",
    credential?: Credential,
  ): Promise<VCSResult> {
    // Fossil sync doesn't support credentials directly
    // Credentials would need to be in the URL
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
      workDir,
    );

    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async getCommitHistory(
    workDir: string,
    limit: number = 10,
  ): Promise<VCSResult> {
    const result = await this.execCommand(
      ["fossil", "timeline", "-n", limit.toString()],
      workDir,
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
    targetDir: string,
    credential?: Credential,
    sourceBranch?: string,
  ): Promise<VCSResult> {
    const { mkdirSync } = await import("fs");

    // Ensure target directory exists
    try {
      mkdirSync(targetDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    if (repoType === "git") {
      let url = repoUrl;
      let sshKeyPath: string | null = null;
      let env: Record<string, string> | undefined = undefined;

      // Handle credentials
      if (credential) {
        if (credential.type === "https" && !this.isSshUrl(repoUrl)) {
          url = this.injectHttpsCredentials(repoUrl, credential);
        } else if (credential.type === "ssh" && this.isSshUrl(repoUrl)) {
          // Create temp SSH key file
          sshKeyPath = this.createTempSshKeyFile(credential.privateKey);
          env = {
            GIT_SSH_COMMAND: this.buildGitSshCommand(sshKeyPath),
          };
        }
      }

      try {
        // Clone Git repository with optional branch
        const cloneArgs = sourceBranch
          ? ["git", "clone", "--branch", sourceBranch, url, targetDir]
          : ["git", "clone", url, targetDir];
        const result = await this.execCommand(cloneArgs, targetDir, env);

        if (
          !result.success &&
          this.isAuthError(
            result.error,
            credential?.type === "ssh" ? "ssh" : "https",
          )
        ) {
          return {
            success: false,
            output: result.output,
            error:
              credential?.type === "ssh"
                ? "SSH authentication failed. Please check your private key and repository access."
                : "Authentication failed. Please check your credentials and repository access.",
          };
        }

        if (result.success) {
          return {
            success: true,
            output: result.output,
          };
        }

        // If git clone failed but directory has content, try cloning into current directory
        const result2 = await this.execCommand(
          ["git", "clone", url, "."],
          targetDir,
          env,
        );

        if (
          !result2.success &&
          this.isAuthError(
            result2.error,
            credential?.type === "ssh" ? "ssh" : "https",
          )
        ) {
          return {
            success: false,
            output: result2.output,
            error:
              credential?.type === "ssh"
                ? "SSH authentication failed. Please check your private key and repository access."
                : "Authentication failed. Please check your credentials and repository access.",
          };
        }

        return {
          success: result2.success,
          output: result2.output,
          error: result2.error || undefined,
        };
      } finally {
        // Clean up temp SSH key file
        if (sshKeyPath) {
          this.deleteTempSshKeyFile(sshKeyPath);
        }
      }
    } else {
      // Clone Fossil repository - inject credentials if HTTPS
      let url = repoUrl;
      if (credential?.type === "https" && !this.isSshUrl(repoUrl)) {
        url = this.injectHttpsCredentials(repoUrl, credential);
      }

      const result = await this.execCommand(
        ["fossil", "clone", url, `${targetDir}/.fossil`],
        targetDir,
      );

      if (!result.success && this.isAuthError(result.error, "https")) {
        return {
          success: false,
          output: result.output,
          error:
            "Authentication failed. Please check your credentials and repository access.",
        };
      }

      if (result.success) {
        // Open the cloned repo in the target directory
        const openResult = await this.openFossil(
          `${targetDir}/.fossil`,
          targetDir,
        );

        if (!openResult.success) {
          return openResult;
        }

        // If sourceBranch specified, checkout that branch
        if (sourceBranch) {
          const checkoutResult = await this.execCommand(
            ["fossil", "checkout", sourceBranch],
            targetDir,
          );
          if (!checkoutResult.success) {
            return {
              success: false,
              output: checkoutResult.output,
              error: `Failed to checkout source branch '${sourceBranch}': ${checkoutResult.error}`,
            };
          }
        }

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
    fossilPath: string,
  ): Promise<VCSResult> {
    if (repoType === "git") {
      // Create a fossil repo from the current working tree only (no git history).
      // This is faster than git fast-export --all and avoids issues with signed tags.

      // Step 1: Init the fossil repo
      const initResult = await this.execCommand(["fossil", "init", fossilPath]);
      if (!initResult.success) {
        return {
          success: false,
          error: `Fossil init failed: ${initResult.error}`,
        };
      }

      // Step 2: Open it in the upstream working tree
      const openResult = await this.execCommand(
        ["fossil", "open", fossilPath, "--nested", "--force"],
        upstreamPath,
      );
      if (!openResult.success) {
        return {
          success: false,
          error: `Fossil open failed: ${openResult.error}`,
        };
      }

      // Step 3: Add all files and commit the current state
      // --dotfiles flag is required to include dotfiles (hidden files starting with '.')
      const addResult = await this.execCommand(
        ["fossil", "addremove", "--dotfiles"],
        upstreamPath,
      );
      if (!addResult.success) {
        return {
          success: false,
          error: `Fossil addremove failed: ${addResult.error}`,
        };
      }

      const commitResult = await this.execCommand(
        ["fossil", "commit", "-m", "Initial import", "--no-warnings"],
        upstreamPath,
      );

      return {
        success: commitResult.success,
        output: commitResult.output,
        error: commitResult.error || undefined,
      };
    } else {
      // For fossil, clone from the upstream fossil repo
      const result = await this.execCommand(
        ["fossil", "clone", `${upstreamPath}/.fossil`, fossilPath],
        upstreamPath,
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
    targetPath: string,
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
      targetPath,
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
    repoType: "git" | "fossil",
  ): Promise<VCSResult> {
    if (repoType === "git") {
      // Export from Fossil to Git upstream
      // Use fossil export to create a git-fast-export stream
      const result = await this.execCommand(
        ["fossil", "export", "--git", fossilPath],
        upstreamPath,
      );

      if (result.success) {
        // Apply the export to git
        const applyResult = await this.execCommand(
          ["git", "fast-import"],
          upstreamPath,
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
    credential?: Credential,
    branch?: string,
  ): Promise<VCSResult> {
    if (repoType === "git") {
      let sshKeyPath: string | null = null;
      let env: Record<string, string> | undefined = undefined;

      // Handle SSH credentials
      if (credential?.type === "ssh") {
        sshKeyPath = this.createTempSshKeyFile(credential.privateKey);
        env = {
          GIT_SSH_COMMAND: this.buildGitSshCommand(sshKeyPath),
        };
      }

      try {
        const pushArgs = branch
          ? ["push", "origin", branch]
          : ["push", "origin"];
        const result = await this.execCommand(
          ["git", ...pushArgs],
          upstreamPath,
          env,
        );

        // Check if the failure is due to no upstream branch configured
        // This is expected in test environments or new repos without remotes
        if (
          !result.success &&
          (result.error?.includes("no upstream branch") ||
            result.error?.includes("has no upstream branch"))
        ) {
          return {
            success: true,
            output: "No remote configured - skipping push",
          };
        }

        if (!result.success && this.isAuthError(result.error, "ssh")) {
          return {
            success: false,
            output: result.output,
            error:
              "SSH authentication failed. Please check your private key and repository access.",
          };
        }

        return {
          success: result.success,
          output: result.output,
          error: result.error || undefined,
        };
      } finally {
        if (sshKeyPath) {
          this.deleteTempSshKeyFile(sshKeyPath);
        }
      }
    } else {
      // Fossil push
      const args = branch ? ["push", branch] : ["push"];
      const result = await this.execCommand(["fossil", ...args], upstreamPath);

      if (!result.success && this.isAuthError(result.error, "https")) {
        return {
          success: false,
          output: result.output,
          error:
            "Authentication failed. Please check your credentials and repository access.",
        };
      }

      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    }
  }

  async setupSessionWorktree(
    projectId: string,
    projectPath: string,
    sessionId: string,
    worktreePath: string,
  ): Promise<VCSResult> {
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

  async commitUpstream(
    upstreamPath: string,
    repoType: "git" | "fossil",
    message?: string,
  ): Promise<VCSResult> {
    const commitMessage =
      message?.trim() || `Mimo commit at ${new Date().toISOString()}`;

    if (repoType === "git") {
      // Git: add all and commit
      const addResult = await this.execCommand(
        ["git", "add", "-A"],
        upstreamPath,
      );
      if (!addResult.success) {
        return {
          success: false,
          output: addResult.output,
          error: addResult.error || "Failed to stage changes",
        };
      }

      // Unstage any VCS metadata files that git add -A may have picked up.
      for (const name of VCS_METADATA) {
        await this.execCommand(
          ["git", "rm", "--cached", "--ignore-unmatch", name],
          upstreamPath,
        );
      }

      const commitResult = await this.execCommand(
        ["git", "commit", "-m", commitMessage],
        upstreamPath,
      );

      // Check if nothing to commit
      if (
        commitResult.error?.includes("nothing to commit") ||
        commitResult.output?.includes("nothing to commit")
      ) {
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
      // Fossil: remove metadata files before addremove so fossil never tracks them.
      const { existsSync: fsExistsSync, unlinkSync } = await import("fs");
      const { join } = await import("path");
      for (const name of VCS_METADATA) {
        const target = join(upstreamPath, name);
        if (fsExistsSync(target)) {
          unlinkSync(target);
          logger.debug(`[vcs] Removed stray ${name} from fossil upstream`);
        }
      }

      // --dotfiles flag is required to include dotfiles (hidden files starting with '.')
      const addResult = await this.execCommand(
        ["fossil", "addremove", "--dotfiles"],
        upstreamPath,
      );
      if (!addResult.success) {
        return {
          success: false,
          output: addResult.output,
          error: addResult.error || "Failed to stage changes",
        };
      }

      let commitResult = await this.execCommand(
        ["fossil", "commit", "-m", commitMessage],
        upstreamPath,
      );

      // Fossil refuses to commit binary files added as text. Forget the
      // offending files and retry once so text-only changes still go through.
      if (!commitResult.success) {
        const combined = `${commitResult.output || ""}\n${commitResult.error || ""}`;
        if (combined.includes("Abandoning commit due to binary data in")) {
          const binaryFiles: string[] = [];
          for (const line of combined.split("\n")) {
            const match = line.match(
              /Abandoning commit due to binary data in (.+)/,
            );
            if (match) binaryFiles.push(match[1].trim());
          }
          for (const file of binaryFiles) {
            await this.execCommand(["fossil", "forget", file], upstreamPath);
          }
          commitResult = await this.execCommand(
            ["fossil", "commit", "-m", commitMessage],
            upstreamPath,
          );
        }

        if (
          !commitResult.success &&
          combined.includes("Abandoning commit due to long lines in")
        ) {
          const longLineFiles: string[] = [];
          for (const line of combined.split("\n")) {
            const match = line.match(
              /Abandoning commit due to long lines in (.+)/,
            );
            if (match) longLineFiles.push(match[1].trim());
          }
          for (const file of longLineFiles) {
            await this.execCommand(["fossil", "forget", file], upstreamPath);
          }
          commitResult = await this.execCommand(
            ["fossil", "commit", "-m", commitMessage],
            upstreamPath,
          );
        }
      }

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
    credential?: Credential,
    branch?: string,
  ): Promise<VCSResult> {
    if (repoType === "git") {
      let sshKeyPath: string | null = null;
      let env: Record<string, string> | undefined = undefined;

      // Handle SSH credentials
      if (credential?.type === "ssh") {
        sshKeyPath = this.createTempSshKeyFile(credential.privateKey);
        env = {
          GIT_SSH_COMMAND: this.buildGitSshCommand(sshKeyPath),
        };
      }

      try {
        const pushArgs = branch
          ? ["push", "origin", branch]
          : ["push", "origin"];
        const result = await this.execCommand(
          ["git", ...pushArgs],
          upstreamPath,
          env,
        );

        // Check if the failure is due to no upstream branch configured
        // This is expected in test environments or new repos without remotes
        if (
          !result.success &&
          (result.error?.includes("no upstream branch") ||
            result.error?.includes("has no upstream branch"))
        ) {
          return {
            success: true,
            output: "No remote configured - skipping push",
          };
        }

        if (
          !result.success &&
          this.isAuthError(
            result.error,
            credential?.type === "ssh" ? "ssh" : "https",
          )
        ) {
          return {
            success: false,
            output: result.output,
            error:
              credential?.type === "ssh"
                ? "SSH authentication failed. Please check your private key and repository access."
                : "Authentication failed. Please check your credentials and repository access.",
          };
        }

        return {
          success: result.success,
          output: result.output,
          error: result.error || undefined,
        };
      } finally {
        if (sshKeyPath) {
          this.deleteTempSshKeyFile(sshKeyPath);
        }
      }
    } else {
      const result = await this.execCommand(["fossil", "push"], upstreamPath);

      if (!result.success && this.isAuthError(result.error, "https")) {
        return {
          success: false,
          output: result.output,
          error:
            "Authentication failed. Please check your credentials and repository access.",
        };
      }

      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    }
  }
  // ── Patch-based sync methods ──────────────────────────────────────

  /**
   * Align workspace disk state with fossil tracking state.
   * Handles `fossil rm` without physical deletion by deleting files
   * that fossil considers DELETED but still exist on disk.
   */
  async alignWorkspaceWithFossil(workspacePath: string): Promise<VCSResult> {
    const result = await this.execCommand(["fossil", "changes"], workspacePath);
    if (!result.success) {
      // Not a fossil checkout or other error — skip silently
      return {
        success: true,
        output: "Not a fossil checkout, skipping alignment",
      };
    }

    const deletedFiles: string[] = [];
    if (result.output) {
      for (const line of result.output.split("\n")) {
        const trimmed = line.trim();
        // fossil changes shows "DELETED  path/to/file"
        if (trimmed.startsWith("DELETED")) {
          const filePath = trimmed.replace(/^DELETED\s+/, "");
          if (filePath) {
            deletedFiles.push(filePath);
          }
        }
      }
    }

    for (const file of deletedFiles) {
      const fullPath = join(workspacePath, file);
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
        logger.debug(`[vcs] Aligned fossil DELETED file: ${file}`);
      }
    }

    return {
      success: true,
      output:
        deletedFiles.length > 0
          ? `Aligned ${deletedFiles.length} fossil-deleted file(s)`
          : "No alignment needed",
    };
  }

  /**
   * Generate a unified patch comparing upstream and agent-workspace directories.
   * Uses `git diff --binary --no-index` from the session parent directory.
   * Returns normalized, filtered patch content.
   */
  async generatePatch(
    agentWorkspacePath: string,
    upstreamPath: string,
  ): Promise<VCSResult & { patch?: string }> {
    const sessionDir = dirname(agentWorkspacePath);
    const upstreamDirName = basename(upstreamPath);
    const agentDirName = basename(agentWorkspacePath);

    // Run git diff --no-index from the session parent directory
    // Exit codes: 0 = no diff, 1 = has diff (normal), >1 = error
    const proc = Bun.spawn(
      [
        "git",
        "diff",
        "--binary",
        "--no-index",
        "--no-color",
        "--",
        upstreamDirName,
        agentDirName,
      ],
      {
        cwd: sessionDir,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (exitCode > 1) {
      return {
        success: false,
        error: `git diff failed: ${stderr}`,
      };
    }

    // Exit code 0 = no differences
    if (exitCode === 0 || !stdout.trim()) {
      return {
        success: true,
        output: "No changes",
        patch: "",
      };
    }

    // Normalize paths and filter VCS metadata
    let patch = this.normalizePatchPaths(stdout, upstreamDirName, agentDirName);
    patch = this.filterVcsMetadata(patch);

    if (!patch.trim()) {
      return {
        success: true,
        output: "No changes",
        patch: "",
      };
    }

    return {
      success: true,
      output: `Patch generated (${patch.split("\n").length} lines)`,
      patch,
    };
  }

  /**
   * Normalize paths in a patch from `a/upstream/X` and `b/agent-workspace/X`
   * to `a/X` and `b/X` so that `git apply` and `patch -p1` work in the upstream directory.
   *
   * For deleted files, git uses `a/upstream/X b/upstream/X` (both sides use first dir).
   * For new files, git uses `a/agent-workspace/X b/agent-workspace/X` (both sides use second dir).
   * So we must strip BOTH dir names from BOTH a/ and b/ positions.
   */
  private normalizePatchPaths(
    patch: string,
    upstreamDirName: string,
    agentDirName: string,
  ): string {
    return (
      patch
        // diff --git header: strip either dir name from both a/ and b/ positions
        .replace(new RegExp(`^(diff --git a/)${upstreamDirName}/`, "gm"), "$1")
        .replace(new RegExp(`^(diff --git a/)${agentDirName}/`, "gm"), "$1")
        .replace(new RegExp(` b/${upstreamDirName}/`, "g"), " b/")
        .replace(new RegExp(` b/${agentDirName}/`, "g"), " b/")
        // --- and +++ lines
        .replace(new RegExp(`^--- a/${upstreamDirName}/`, "gm"), "--- a/")
        .replace(new RegExp(`^--- a/${agentDirName}/`, "gm"), "--- a/")
        .replace(new RegExp(`^\\+\\+\\+ b/${upstreamDirName}/`, "gm"), "+++ b/")
        .replace(new RegExp(`^\\+\\+\\+ b/${agentDirName}/`, "gm"), "+++ b/")
        // rename/copy headers
        .replace(
          new RegExp(`^rename from ${upstreamDirName}/`, "gm"),
          "rename from ",
        )
        .replace(
          new RegExp(`^rename from ${agentDirName}/`, "gm"),
          "rename from ",
        )
        .replace(
          new RegExp(`^rename to ${upstreamDirName}/`, "gm"),
          "rename to ",
        )
        .replace(new RegExp(`^rename to ${agentDirName}/`, "gm"), "rename to ")
        .replace(
          new RegExp(`^copy from ${upstreamDirName}/`, "gm"),
          "copy from ",
        )
        .replace(new RegExp(`^copy from ${agentDirName}/`, "gm"), "copy from ")
        .replace(new RegExp(`^copy to ${upstreamDirName}/`, "gm"), "copy to ")
        .replace(new RegExp(`^copy to ${agentDirName}/`, "gm"), "copy to ")
    );
  }

  /**
   * Remove diff hunks for VCS metadata files from a patch.
   */
  private filterVcsMetadata(patch: string): string {
    const lines = patch.split("\n");
    const result: string[] = [];
    let skipCurrentFile = false;

    for (const line of lines) {
      if (line.startsWith("diff --git")) {
        skipCurrentFile =
          VCS_METADATA.some(
            (meta) => line.includes(`a/${meta}`) || line.includes(`b/${meta}`),
          ) ||
          Array.from(VCS_INTERNALS).some(
            (internal) =>
              line.includes(`a/${internal}/`) ||
              line.includes(`b/${internal}/`),
          );
      }

      if (!skipCurrentFile) {
        result.push(line);
      }
    }

    return result.join("\n");
  }

  /**
   * Store a patch file in the session's patches directory.
   * Returns the path to the stored patch file.
   */
  async storePatch(patchDir: string, patchContent: string): Promise<string> {
    if (!existsSync(patchDir)) {
      mkdirSync(patchDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const patchFile = join(patchDir, `${timestamp}.patch`);
    writeFileSync(patchFile, patchContent, "utf-8");
    return patchFile;
  }

  /**
   * Apply a patch to the upstream directory.
   * Uses `git apply --binary` for git repos, `patch -p1` for fossil repos.
   */
  async applyPatch(
    patchFilePath: string,
    upstreamPath: string,
    repoType: "git" | "fossil",
  ): Promise<VCSResult> {
    if (repoType === "git") {
      const result = await this.execCommand(
        ["git", "apply", "--binary", patchFilePath],
        upstreamPath,
      );
      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    } else {
      // For fossil upstream, use POSIX patch command
      const patchContent = readFileSync(patchFilePath, "utf-8");
      const proc = Bun.spawn(["patch", "-p1", "--no-backup-if-mismatch"], {
        cwd: upstreamPath,
        stdin: new Blob([patchContent]),
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      return {
        success: exitCode === 0,
        output: stdout.trim(),
        error: exitCode !== 0 ? stderr.trim() || "patch -p1 failed" : undefined,
      };
    }
  }

  /**
   * Full patch workflow: align → generate → store → apply.
   * Replaces cleanCopyToUpstream.
   */
  async generateAndApplyPatch(
    agentWorkspacePath: string,
    upstreamPath: string,
    patchDir: string,
    repoType: "git" | "fossil",
  ): Promise<VCSResult & { patchPath?: string }> {
    // Step 1: Align agent-workspace disk state with fossil
    const alignResult = await this.alignWorkspaceWithFossil(agentWorkspacePath);
    if (!alignResult.success) {
      return {
        success: false,
        error: `Alignment failed: ${alignResult.error}`,
      };
    }

    // Also align upstream if it's a fossil repo
    if (repoType === "fossil") {
      const upstreamAlignResult =
        await this.alignWorkspaceWithFossil(upstreamPath);
      if (!upstreamAlignResult.success) {
        return {
          success: false,
          error: `Upstream alignment failed: ${upstreamAlignResult.error}`,
        };
      }
    }

    // Step 2: Generate patch
    const genResult = await this.generatePatch(
      agentWorkspacePath,
      upstreamPath,
    );
    if (!genResult.success) {
      return {
        success: false,
        error: `Patch generation failed: ${genResult.error}`,
      };
    }

    // No changes — nothing to do
    if (!genResult.patch) {
      return { success: true, output: "No changes" };
    }

    // Step 3: Store patch
    const patchPath = await this.storePatch(patchDir, genResult.patch);
    logger.debug(`[vcs] Patch stored: ${patchPath}`);

    // Step 4: Apply patch
    const applyResult = await this.applyPatch(
      patchPath,
      upstreamPath,
      repoType,
    );
    if (!applyResult.success) {
      return {
        success: false,
        error: `Patch apply failed: ${applyResult.error}`,
        patchPath,
      };
    }

    return {
      success: true,
      output: `Patch applied successfully`,
      patchPath,
    };
  }
}

export const vcs = new VCS();
