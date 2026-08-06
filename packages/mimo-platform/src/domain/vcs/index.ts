// SPDX-License-Identifier: AGPL-3.0-only
/**
 * VCS (Version Control System) abstraction.
 *
 * All OS operations are injected via the `OS` interface.
 * No direct imports from `child_process`, `fs`, `os`, or `process.env`.
 */
import type { OS } from "../../infrastructure/os/types.js";
import type { Credential } from "../credentials/repository";
import {
  buildGitSshCommand as buildSharedGitSshCommand,
  injectHttpsCredentials as injectSharedHttpsCredentials,
  isSshRepoUrl,
  normalizeSshPrivateKey,
} from "./credential-injection.js";
import { logger } from "../../logger.js";
import { EXCLUDED_PATHS, isExcluded } from "../files/path-policy.js";
import { parsePatchPreview, type DiffHunk } from "../commits/patch-preview.js";
import type {
  ChangedFilesResult,
  FileChange,
  FileChangeStatus,
} from "../files/changed-files.js";

export interface VCSResult {
  success: boolean;
  output?: string;
  error?: string;
  port?: number;
  commitHash?: string;
}

import { DEFAULT_MIMO_HOST } from "../../infrastructure/context/mimo-context.js";

export interface VCSConfig {
  os: OS;
  timeoutMs?: number;
  cloneTimeoutMs?: number;
  host?: string;
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CLONE_TIMEOUT_MS = 10 * 60 * 1000;

const withTimeout = <T>(
  promise: Promise<T>,
  ms: number = DEFAULT_TIMEOUT_MS,
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
    ),
  ]);
};

/**
 * Scan a directory recursively, calling a callback for each non-VCS file.
 * Skips built-in excluded paths (via isExcluded from path-policy) automatically.
 */
export async function scanDirectory(
  os: OS,
  dirPath: string,
  basePath: string,
  callback: (fullPath: string, relPath: string) => void | Promise<void>,
): Promise<void> {
  if (!(await os.fs.existsAsync(dirPath))) return;

  const entries = await os.fs.readdirAsync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = os.path.join(dirPath, entry.name);
    const relPath = os.path.relative(basePath, fullPath);

    if (isExcluded(entry.name)) continue;

    const entryStats = await os.fs.lstatAsync(fullPath);
    if (entryStats.isDirectory()) {
      await scanDirectory(os, fullPath, basePath, callback);
    } else if (entryStats.isFile()) {
      await callback(fullPath, relPath);
    }
  }
}

export class VCS {
  private readonly os: OS;
  private readonly timeoutMs: number;
  private readonly cloneTimeoutMs: number;
  private readonly host: string;

  constructor(config: VCSConfig) {
    this.os = config.os;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cloneTimeoutMs = config.cloneTimeoutMs ?? DEFAULT_CLONE_TIMEOUT_MS;
    this.host = config.host ?? DEFAULT_MIMO_HOST;
  }

  // ── Core command execution ──────────────────────────────────────────────

  private async execCommand(
    command: string[],
    cwd?: string,
    env?: Record<string, string>,
    timeoutMs?: number,
  ): Promise<{ success: boolean; output: string; error: string }> {
    const result = await this.os.command.run(command, {
      cwd,
      env: env ? { ...this.os.env.getAll(), ...env } : undefined,
      timeoutMs: timeoutMs ?? this.timeoutMs,
    });

    return {
      success: result.success,
      output: result.output,
      error: result.error,
    };
  }

  // ── SSH key helpers (now use injected fs/path) ──────────────────────────

  private createTempSshKeyFile(privateKey: string): string {
    const normalizedPrivateKey = normalizeSshPrivateKey(privateKey);
    const tempDir = this.os.path.tempDir();
    const keyFile = this.os.path.join(
      tempDir,
      `mimo-ssh-key-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    this.os.fs.writeFile(keyFile, normalizedPrivateKey, { mode: 0o600 });
    this.os.fs.chmod(keyFile, 0o600);
    return keyFile;
  }

  private async deleteTempSshKeyFile(keyPath: string): Promise<void> {
    try {
      if (this.os.fs.exists(keyPath)) {
        this.os.fs.unlink(keyPath);
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  private buildGitSshCommand(keyPath?: string, clonePort?: number): string {
    return buildSharedGitSshCommand(keyPath, clonePort);
  }

  private sanitizeGitUrl(repoUrl: string): string {
    try {
      const url = new URL(repoUrl);
      if (url.username) url.username = "***";
      if (url.password) url.password = "***";
      return url.toString();
    } catch {
      return repoUrl;
    }
  }

  // ── URL / auth helpers (pure functions, unchanged) ───────────────────────

  private isSshUrl(url: string): boolean {
    return isSshRepoUrl(url);
  }

  private injectHttpsCredentials(
    repoUrl: string,
    credential: Extract<Credential, { type: "https" }>,
  ): string {
    return injectSharedHttpsCredentials(repoUrl, credential);
  }

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

  // ── File system helpers ─────────────────────────────────────────────────

  private safeMove(
    sourcePath: string,
    destPath: string,
    isDirectory: boolean,
  ): void {
    try {
      this.os.fs.rename(sourcePath, destPath);
    } catch (error: any) {
      // If error is cross-device link, fall back to copy+delete
      if (error.code === "EXDEV" || error.message?.includes("cross-device")) {
        // Ensure parent directory exists for destination
        const parentDir = this.os.path.dirname(destPath);
        this.os.fs.mkdir(parentDir, { recursive: true });

        if (isDirectory) {
          this.os.fs.cp(sourcePath, destPath, {
            recursive: true,
            preserveTimestamps: true,
          });
          // Verify copy succeeded before deleting source
          if (!this.os.fs.exists(destPath)) {
            throw new Error(
              `Failed to copy directory from ${sourcePath} to ${destPath}`,
            );
          }
          this.os.fs.rm(sourcePath, { recursive: true, force: true });
        } else {
          this.os.fs.cp(sourcePath, destPath, { preserveTimestamps: true });
          if (!this.os.fs.exists(destPath)) {
            throw new Error(
              `Failed to copy file from ${sourcePath} to ${destPath}`,
            );
          }
          this.os.fs.rm(sourcePath, { force: true });
        }
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

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

  async getCurrentBranch(
    repoType: "git" | "fossil",
    workDir: string,
  ): Promise<{ success: boolean; branch?: string; error?: string }> {
    if (repoType === "git") {
      const result = await this.execCommand(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        workDir,
      );
      if (!result.success) {
        return { success: false, error: result.error || undefined };
      }
      return { success: true, branch: result.output.trim() };
    }
    const result = await this.execCommand(
      ["fossil", "branch", "current"],
      workDir,
    );
    if (!result.success) {
      return { success: false, error: result.error || undefined };
    }
    return { success: true, branch: result.output.trim() };
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

  async createFossilUserInRepo(
    sessionId: string,
    username: string,
    password: string,
    port: number,
    setupUser: string,
    setupPassword: string,
  ): Promise<VCSResult> {
    const normalizedId = sessionId.replace(/-/g, "_");
    const url = `http://${encodeURIComponent(setupUser)}:${encodeURIComponent(setupPassword)}@${this.host}:${port}/${normalizedId}`;

    const result = await this.execCommand([
      "fossil",
      "remote-url",
      url,
      "-R",
      ":memory:",
      "--user",
      username,
      "--password",
      password,
    ]);

    try {
      const response = await fetch(
        `http://${this.host}:${port}/${normalizedId}/json/user/new`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${btoa(`${setupUser}:${setupPassword}`)}`,
          },
          body: JSON.stringify({
            user: username,
            password: password,
            capabilities: "dio",
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
    vcsPath: string,
    name: string,
  ): Promise<VCSResult> {
    const escapedName = name.replace(/'/g, "''");
    const result = await this.execCommand([
      "fossil",
      "sql",
      "-R",
      vcsPath,
      `INSERT OR REPLACE INTO config(name, value, mtime) VALUES('project-name', '${escapedName}', unixepoch())`,
    ]);
    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async openFossil(
    repoPath: string,
    workDir: string,
    branchName?: string,
  ): Promise<VCSResult> {
    const args = branchName
      ? ["fossil", "open", repoPath, branchName]
      : ["fossil", "open", repoPath];
    const result = await this.execCommand(args, workDir);
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
    const parsePatterns = (filePath: string): string[] =>
      this.os.fs.exists(filePath)
        ? this.os.fs
            .readFile(filePath, "utf8")
            .split("\n")
            .map((line: string) => line.trim())
            .filter((line: string) => line.length > 0 && !line.startsWith("#"))
        : [];

    // Fossil manages its own internals natively; including them in ignore-glob
    // would prevent "fossil add .fossil-settings/ignore-glob" from working.
    const fossilNative = new Set([
      ".fossil",
      ".fslckout",
      ".fslckout-journal",
      ".fossil-settings",
      "_FOSSIL_",
    ]);
    const patterns = [
      ...EXCLUDED_PATHS.filter((p) => !fossilNative.has(p)).flatMap((p) => [
        p,
        `${p}/**`,
      ]),
      ...parsePatterns(this.os.path.join(upstreamPath, ".gitignore")),
      ...parsePatterns(this.os.path.join(upstreamPath, ".mimoignore")),
    ];
    const uniquePatterns = Array.from(new Set(patterns));

    const fossilSettingsDir = this.os.path.join(
      agentWorkspacePath,
      ".fossil-settings",
    );
    if (!this.os.fs.exists(fossilSettingsDir)) {
      this.os.fs.mkdir(fossilSettingsDir, { recursive: true });
    }
    this.os.fs.writeFile(
      this.os.path.join(fossilSettingsDir, "ignore-glob"),
      uniquePatterns.join("\n") + "\n",
    );

    const addResult = await this.execCommand(
      ["fossil", "add", ".fossil-settings/ignore-glob"],
      agentWorkspacePath,
    );
    const addCombined = `${addResult.output}\n${addResult.error}`.toLowerCase();
    if (
      !addResult.success &&
      !addCombined.includes("already part of the repository") &&
      !addCombined.includes("already in repository")
    ) {
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

    const commitCombined =
      `${commitResult.output}\n${commitResult.error}`.toLowerCase();
    if (
      !commitResult.success &&
      commitCombined.includes("nothing has changed")
    ) {
      return { success: true, output: "ignore-glob unchanged" };
    }

    return {
      success: commitResult.success,
      output: commitResult.output,
      error: commitResult.error || undefined,
    };
  }

  // ── Git session repository (replaces the Fossil session layer) ──────────

  /**
   * Seed the bare Git session repository (`<sid>.git`) served to agents.
   *
   * - Git upstream: `git clone --bare` from the upstream checkout (preserves history).
   * - Fossil upstream: snapshot the upstream working tree into a single initial
   *   commit (parity with the previous `importToFossil` behavior).
   *
   * Always enables `http.receivepack` so the agent can push back.
   */
  async seedSessionRepo(
    upstreamPath: string,
    repoType: "git" | "fossil",
    repoPath: string,
    branch?: string,
  ): Promise<VCSResult> {
    const branchName = branch || "main";

    if (repoType === "git") {
      // `--dissociate` is required: the upstream checkout is created with
      // `git clone --reference <project-cache>`, so it borrows objects from the
      // cache via `.git/objects/info/alternates`. Without `--dissociate` the
      // bare seed inherits that alternate and owns no objects, so once the
      // cache is refreshed/GC'd the served repo is missing objects and agents
      // fail to clone with "fatal: expected 'packfile'". `--dissociate` copies
      // the borrowed objects into the seed, making it self-contained.
      const clone = await this.execCommand(
        [
          "git",
          "clone",
          "--bare",
          "--depth=1",
          "--single-branch",
          "--dissociate",
          upstreamPath,
          repoPath,
        ],
        undefined,
        undefined,
        this.cloneTimeoutMs,
      );
      if (!clone.success) {
        return {
          success: false,
          error: `git clone --bare failed: ${clone.error}`,
        };
      }
    } else {
      const init = await this.execCommand([
        "git",
        "init",
        "--bare",
        "-b",
        branchName,
        repoPath,
      ]);
      if (!init.success) {
        return {
          success: false,
          error: `git init --bare failed: ${init.error}`,
        };
      }

      // Build a single "Initial import" commit from the upstream working tree,
      // using a throwaway index and excluding Fossil internals.
      const indexFile = this.os.path.join(repoPath, "mimo-seed-index");
      const gitEnv: Record<string, string> = {
        GIT_DIR: repoPath,
        GIT_WORK_TREE: upstreamPath,
        GIT_INDEX_FILE: indexFile,
      };
      const add = await this.execCommand(
        [
          "git",
          "add",
          "-A",
          "--",
          ".",
          ":(exclude,glob).fossil*",
          ":(exclude,glob).fslckout*",
          ":(exclude)_FOSSIL_",
        ],
        upstreamPath,
        gitEnv,
        this.cloneTimeoutMs,
      );
      if (!add.success) {
        return { success: false, error: `git add (seed) failed: ${add.error}` };
      }
      const writeTree = await this.execCommand(
        ["git", "write-tree"],
        upstreamPath,
        gitEnv,
      );
      if (!writeTree.success) {
        return {
          success: false,
          error: `git write-tree failed: ${writeTree.error}`,
        };
      }
      const tree = writeTree.output.trim();
      const commitEnv: Record<string, string> = {
        ...gitEnv,
        GIT_AUTHOR_NAME: "mimo",
        GIT_AUTHOR_EMAIL: "mimo@local",
        GIT_COMMITTER_NAME: "mimo",
        GIT_COMMITTER_EMAIL: "mimo@local",
      };
      const commitTree = await this.execCommand(
        ["git", "commit-tree", tree, "-m", "Initial import"],
        upstreamPath,
        commitEnv,
      );
      if (!commitTree.success) {
        return {
          success: false,
          error: `git commit-tree failed: ${commitTree.error}`,
        };
      }
      const commit = commitTree.output.trim();
      const updateRef = await this.execCommand(
        ["git", "update-ref", `refs/heads/${branchName}`, commit],
        upstreamPath,
        gitEnv,
      );
      if (!updateRef.success) {
        return {
          success: false,
          error: `git update-ref failed: ${updateRef.error}`,
        };
      }
      if (this.os.fs.exists(indexFile)) {
        this.os.fs.unlink(indexFile);
      }
    }

    const receivePack = await this.execCommand(
      ["git", "config", "http.receivepack", "true"],
      repoPath,
    );
    if (!receivePack.success) {
      return {
        success: false,
        error: `git config http.receivepack failed: ${receivePack.error}`,
      };
    }

    // Surface the seed commit SHA as `commitHash` so the session lifecycle can
    // record it as the initial `baseline` for git-range detection. The bare
    // repo's HEAD is the seeded base commit for both git and fossil upstreams.
    const head = await this.execCommand(["git", "rev-parse", "HEAD"], repoPath);
    return {
      success: true,
      commitHash: head.success ? head.output.trim() : undefined,
    };
  }

  /**
   * Clone the bare session repo into the platform's own working checkout
   * (`agentWorkspacePath`) via a local path. Replaces `openFossil` for the
   * platform side.
   */
  async clonePlatformCheckout(
    repoPath: string,
    agentWorkspacePath: string,
    branch?: string,
  ): Promise<VCSResult> {
    const clone = await this.execCommand(
      [
        "git",
        "clone",
        "--depth=1",
        "--single-branch",
        repoPath,
        agentWorkspacePath,
      ],
      undefined,
      undefined,
      this.cloneTimeoutMs,
    );
    if (!clone.success) {
      return {
        success: false,
        error: `git clone (platform checkout) failed: ${clone.error}`,
      };
    }
    if (branch) {
      const checkout = await this.execCommand(
        ["git", "checkout", branch],
        agentWorkspacePath,
      );
      if (!checkout.success) {
        return {
          success: false,
          error: `git checkout '${branch}' failed: ${checkout.error}`,
        };
      }
    }
    return { success: true };
  }

  /**
   * Refresh the platform's own checkout after the agent pushes. Replaces
   * `fossilUp`. Uses `--ff-only` so a divergent history fails loudly instead
   * of creating a silent merge.
   */
  async gitPull(agentWorkspacePath: string): Promise<VCSResult> {
    const result = await this.execCommand(
      ["git", "pull", "--ff-only"],
      agentWorkspacePath,
    );
    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  /**
   * Write the platform checkout's `.git/info/exclude` from EXCLUDED_PATHS plus
   * the upstream `.gitignore`/`.mimoignore`. Replaces `syncIgnoresToFossil`.
   * (The remote agent writes its own exclude at clone time.)
   */
  async syncIgnoresToGit(
    upstreamPath: string,
    agentWorkspacePath: string,
  ): Promise<VCSResult> {
    const parsePatterns = (filePath: string): string[] =>
      this.os.fs.exists(filePath)
        ? this.os.fs
            .readFile(filePath, "utf8")
            .split("\n")
            .map((line: string) => line.trim())
            .filter((line: string) => line.length > 0 && !line.startsWith("#"))
        : [];

    const patterns = [
      ...EXCLUDED_PATHS.flatMap((p) => [p, `${p}/`]),
      ...parsePatterns(this.os.path.join(upstreamPath, ".gitignore")),
      ...parsePatterns(this.os.path.join(upstreamPath, ".mimoignore")),
    ];
    const uniquePatterns = Array.from(new Set(patterns));

    const infoDir = this.os.path.join(agentWorkspacePath, ".git", "info");
    if (!this.os.fs.exists(infoDir)) {
      this.os.fs.mkdir(infoDir, { recursive: true });
    }
    this.os.fs.writeFile(
      this.os.path.join(infoDir, "exclude"),
      uniquePatterns.join("\n") + "\n",
    );
    return { success: true };
  }

  async importGitToFossil(
    gitUrl: string,
    workDir: string,
    credential?: Credential,
  ): Promise<VCSResult> {
    let url = gitUrl;

    if (credential?.type === "https" && !this.isSshUrl(gitUrl)) {
      url = this.injectHttpsCredentials(gitUrl, credential);
    }

    try {
      new URL(url);
    } catch {
      if (!this.isSshUrl(url)) {
        return {
          success: false,
          error: "Invalid Git URL format",
        };
      }
    }

    const vcsPath = `${workDir}/.fossil`;
    const initResult = await this.createFossilRepo(vcsPath);
    if (!initResult.success) {
      return initResult;
    }

    const result = await this.execCommand(
      ["fossil", "import", "--git", url, vcsPath],
      workDir,
      undefined,
      this.cloneTimeoutMs,
    );

    if (result.success) {
      const openResult = await this.openFossil(vcsPath, workDir);
      return openResult;
    }

    return {
      success: false,
      output: result.output,
      error: result.error || "Failed to import from Git",
    };
  }

  async cloneFossil(sourcePath: string, targetDir: string): Promise<VCSResult> {
    try {
      this.os.fs.mkdir(targetDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    const result = await this.execCommand(
      ["fossil", "clone", sourcePath, `${targetDir}/.fossil`],
      undefined,
      undefined,
      this.cloneTimeoutMs,
    );

    if (result.success) {
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
    clonePort?: number,
  ): Promise<VCSResult> {
    try {
      this.os.fs.mkdir(targetDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    if (repoType === "git") {
      let url = repoUrl;
      let sshKeyPath: string | null = null;
      let env: Record<string, string> | undefined = undefined;

      if (credential?.type === "https" && !this.isSshUrl(repoUrl)) {
        url = this.injectHttpsCredentials(repoUrl, credential);
      } else if (credential?.type === "ssh" || clonePort != null) {
        if (credential?.type === "ssh") {
          sshKeyPath = this.createTempSshKeyFile(credential.privateKey);
        }
        env = {
          GIT_SSH_COMMAND: this.buildGitSshCommand(
            sshKeyPath ?? undefined,
            clonePort,
          ),
        };
      }

      try {
        const cloneArgs = sourceBranch
          ? [
              "git",
              "clone",
              "--depth=1",
              "--single-branch",
              "--quiet",
              "--branch",
              sourceBranch,
              url,
              targetDir,
            ]
          : [
              "git",
              "clone",
              "--depth=1",
              "--single-branch",
              "--quiet",
              url,
              targetDir,
            ];
        logger.debug("[vcs] Starting git clone", {
          repoUrl: this.sanitizeGitUrl(repoUrl),
          targetDir,
          sourceBranch: sourceBranch ?? null,
          credentialType: credential?.type ?? null,
          usingInjectedSshCommand: !!env?.GIT_SSH_COMMAND,
        });
        const result = await this.execCommand(
          cloneArgs,
          targetDir,
          env,
          this.cloneTimeoutMs,
        );
        logger.debug("[vcs] git clone finished", {
          success: result.success,
          error: result.error,
          output: result.output,
        });

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

        if (sourceBranch) {
          return {
            success: false,
            output: result.output,
            error:
              result.error ||
              `Failed to clone branch '${sourceBranch}' — does it exist on the remote?`,
          };
        }

        return {
          success: false,
          output: result.output,
          error: result.error || undefined,
        };
      } finally {
        if (sshKeyPath) {
          await this.deleteTempSshKeyFile(sshKeyPath);
        }
      }
    } else {
      let url = repoUrl;
      if (credential?.type === "https" && !this.isSshUrl(repoUrl)) {
        url = this.injectHttpsCredentials(repoUrl, credential);
      }

      const result = await this.execCommand(
        ["fossil", "clone", url, `${targetDir}/.fossil`],
        targetDir,
        undefined,
        this.cloneTimeoutMs,
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
        const openResult = await this.openFossil(
          `${targetDir}/.fossil`,
          targetDir,
        );

        if (!openResult.success) {
          return openResult;
        }

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
    vcsPath: string,
    branchName?: string,
  ): Promise<VCSResult> {
    if (repoType === "git") {
      const initResult = await this.execCommand(["fossil", "init", vcsPath]);
      if (!initResult.success) {
        return {
          success: false,
          error: `Fossil init failed: ${initResult.error}`,
        };
      }

      const openResult = await this.execCommand(
        ["fossil", "open", vcsPath, "--nested", "--force"],
        upstreamPath,
        undefined,
        this.cloneTimeoutMs,
      );
      if (!openResult.success) {
        return {
          success: false,
          error: `Fossil open failed: ${openResult.error}`,
        };
      }

      const addResult = await this.execCommand(
        ["fossil", "addremove", "--dotfiles"],
        upstreamPath,
        undefined,
        this.cloneTimeoutMs,
      );
      if (!addResult.success) {
        return {
          success: false,
          error: `Fossil addremove failed: ${addResult.error}`,
        };
      }

      // When branchName is set, commit on a named branch so the fossil repo
      // mirrors the upstream git branch instead of landing on trunk.
      const commitArgs = [
        "fossil",
        "commit",
        "-m",
        "Initial import",
        "--no-warnings",
      ];
      if (branchName) {
        commitArgs.push("--branch", branchName);
      }
      const commitResult = await this.execCommand(
        commitArgs,
        upstreamPath,
        undefined,
        this.cloneTimeoutMs,
      );

      return {
        success: commitResult.success,
        output: commitResult.output,
        error: commitResult.error || undefined,
      };
    } else {
      const result = await this.execCommand(
        ["fossil", "clone", `${upstreamPath}/.fossil`, vcsPath],
        upstreamPath,
        undefined,
        this.cloneTimeoutMs,
      );

      return {
        success: result.success,
        output: result.output,
        error: result.error || undefined,
      };
    }
  }

  async openFossilCheckout(
    vcsPath: string,
    targetPath: string,
  ): Promise<VCSResult> {
    try {
      this.os.fs.mkdir(targetPath, { recursive: true });
    } catch {
      // Directory might already exist
    }

    const result = await this.execCommand(
      ["fossil", "open", vcsPath],
      targetPath,
    );

    return {
      success: result.success,
      output: result.output,
      error: result.error || undefined,
    };
  }

  async exportFromFossil(
    vcsPath: string,
    upstreamPath: string,
    repoType: "git" | "fossil",
  ): Promise<VCSResult> {
    if (repoType === "git") {
      const result = await this.execCommand(
        ["fossil", "export", "--git", vcsPath],
        upstreamPath,
      );

      if (result.success) {
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
    clonePort?: number,
  ): Promise<VCSResult> {
    if (repoType === "git") {
      let sshKeyPath: string | null = null;
      let env: Record<string, string> | undefined = undefined;

      if (credential?.type === "ssh" || clonePort != null) {
        if (credential?.type === "ssh") {
          sshKeyPath = this.createTempSshKeyFile(credential.privateKey);
        }
        env = {
          GIT_SSH_COMMAND: this.buildGitSshCommand(
            sshKeyPath ?? undefined,
            clonePort,
          ),
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
          await this.deleteTempSshKeyFile(sshKeyPath);
        }
      }
    } else {
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
    const vcsPath = `${projectPath}/repo.fossil`;

    try {
      this.os.fs.mkdir(worktreePath, { recursive: true });
    } catch {
      // Directory might already exist
    }

    if (!this.os.fs.exists(vcsPath)) {
      return {
        success: false,
        error: "Project fossil repository not found",
      };
    }

    return await this.openFossil(vcsPath, worktreePath);
  }

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

      for (const name of EXCLUDED_PATHS) {
        await this.execCommand(
          ["git", "rm", "--cached", "--ignore-unmatch", name],
          upstreamPath,
        );
      }

      const commitResult = await this.execCommand(
        ["git", "commit", "-m", commitMessage],
        upstreamPath,
      );

      if (
        commitResult.error?.includes("nothing to commit") ||
        commitResult.output?.includes("nothing to commit")
      ) {
        return {
          success: true,
          output: "No changes to commit",
        };
      }

      // Extract commit hash after successful git commit
      let commitHash: string | undefined;
      if (commitResult.success) {
        const logResult = await this.execCommand(
          ["git", "log", "-1", "--pretty=%H"],
          upstreamPath,
        );
        if (logResult.success) {
          commitHash = logResult.output.trim();
        }
      }

      return {
        success: commitResult.success,
        output: commitResult.output,
        error: commitResult.error || undefined,
        commitHash,
      };
    } else {
      for (const name of EXCLUDED_PATHS) {
        const target = this.os.path.join(upstreamPath, name);
        if (this.os.fs.exists(target)) {
          this.os.fs.unlink(target);
          logger.debug(`[vcs] Removed stray ${name} from fossil upstream`);
        }
      }

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

      let fossilCommitResult = await this.execCommand(
        ["fossil", "commit", "-m", commitMessage],
        upstreamPath,
      );

      if (!fossilCommitResult.success) {
        const combined = `${fossilCommitResult.output || ""}\n${fossilCommitResult.error || ""}`;
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
          fossilCommitResult = await this.execCommand(
            ["fossil", "commit", "-m", commitMessage],
            upstreamPath,
          );
        }

        if (
          !fossilCommitResult.success &&
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
          fossilCommitResult = await this.execCommand(
            ["fossil", "commit", "-m", commitMessage],
            upstreamPath,
          );
        }
      }

      // Extract commit hash after successful fossil commit
      let commitHash: string | undefined;
      if (fossilCommitResult.success) {
        const infoResult = await this.execCommand(
          ["fossil", "info"],
          upstreamPath,
        );
        if (infoResult.success) {
          const checkoutMatch = infoResult.output.match(
            /checkout:\s+([0-9a-f]{10,})/i,
          );
          if (checkoutMatch) {
            commitHash = checkoutMatch[1];
          }
        }
      }

      return {
        success: fossilCommitResult.success,
        output: fossilCommitResult.output,
        error: fossilCommitResult.error || undefined,
        commitHash,
      };
    }
  }

  async pushUpstream(
    upstreamPath: string,
    repoType: "git" | "fossil",
    credential?: Credential,
    branch?: string,
    options?: { force?: boolean },
    clonePort?: number,
  ): Promise<VCSResult> {
    if (repoType === "git") {
      let sshKeyPath: string | null = null;
      let env: Record<string, string> | undefined = undefined;

      if (credential?.type === "ssh" || clonePort != null) {
        if (credential?.type === "ssh") {
          sshKeyPath = this.createTempSshKeyFile(credential.privateKey);
        }
        env = {
          GIT_SSH_COMMAND: this.buildGitSshCommand(
            sshKeyPath ?? undefined,
            clonePort,
          ),
        };
      }

      try {
        const pushArgs = branch
          ? ["push", "origin", branch]
          : ["push", "origin"];
        if (options?.force) {
          pushArgs.push("--force");
        }
        const result = await this.execCommand(
          ["git", ...pushArgs],
          upstreamPath,
          env,
        );

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
          await this.deleteTempSshKeyFile(sshKeyPath);
        }
      }
    } else {
      const args = options?.force ? ["push", "--force"] : ["push"];
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

  async alignWorkspaceWithFossil(workspacePath: string): Promise<VCSResult> {
    const result = await this.execCommand(["fossil", "changes"], workspacePath);
    if (!result.success) {
      return {
        success: true,
        output: "Not a fossil checkout, skipping alignment",
      };
    }

    const deletedFiles: string[] = [];
    if (result.output) {
      for (const line of result.output.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("DELETED")) {
          const filePath = trimmed.replace(/^DELETED\s+/, "");
          if (filePath) {
            deletedFiles.push(filePath);
          }
        }
      }
    }

    for (const file of deletedFiles) {
      const fullPath = this.os.path.join(workspacePath, file);
      if (this.os.fs.exists(fullPath)) {
        this.os.fs.unlink(fullPath);
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

  async generatePatch(
    agentWorkspacePath: string,
    upstreamPath: string,
  ): Promise<VCSResult & { patch?: string }> {
    const sessionDir = this.os.path.dirname(agentWorkspacePath);
    const upstreamDirName = this.os.path.basename(upstreamPath);
    const agentDirName = this.os.path.basename(agentWorkspacePath);

    const proc = this.os.command.spawn(
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
      { cwd: sessionDir },
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

    if (exitCode === 0 || !stdout.trim()) {
      return {
        success: true,
        output: "No changes",
        patch: "",
      };
    }

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
   * Diff two individual files and return the unified-diff patch. Used by the
   * commit preview to fetch one file's hunks on demand without diffing the whole
   * tree. Pass "/dev/null" for the missing side to render added/deleted files.
   * This is git used purely as a two-file diff tool, so it is independent of the
   * session's repository type.
   */
  async diffFile(
    oldFile: string,
    newFile: string,
  ): Promise<VCSResult & { patch?: string }> {
    const proc = this.os.command.spawn(
      ["git", "diff", "--no-index", "--no-color", "--", oldFile, newFile],
      {},
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    // git diff exits 1 when files differ (the normal case here); >1 is an error.
    if (exitCode > 1) {
      return { success: false, error: `git diff failed: ${stderr}` };
    }

    return { success: true, patch: stdout };
  }

  // ── Git commit-range detection ──────────────────────────────────────────
  //
  // `agent-workspace` is always a git checkout (every repo type is funnelled
  // through a git bare seed), so the upstream→workspace delta the commit
  // preview and impact buffer want is exactly the commit range
  // `<baseline>..HEAD`. These helpers answer it from git's object store in
  // O(changed), replacing the two-tree filesystem scan for those read paths.
  // They are git-only by construction and therefore independent of the
  // session's upstream repository type.

  /**
   * Resolve the root commit (the commit with no parents) of the git history
   * reachable from HEAD. This is the seeded base commit the session was cloned
   * from; it never advances. Implemented as `git rev-list --max-parents=0 HEAD`.
   * Returns null when the workspace has no commits.
   */
  async resolveRootCommit(workDir: string): Promise<string | null> {
    const result = await this.execCommand(
      ["git", "rev-list", "--max-parents=0", "HEAD"],
      workDir,
    );
    const sha = result.output.trim().split(/\s+/)[0];
    return result.success && sha.length > 0 ? sha : null;
  }

  /**
   * Resolve a ref/expression to a commit SHA in the given git checkout.
   * Returns null when the ref cannot be resolved.
   */
  async revParse(workDir: string, ref: string): Promise<string | null> {
    const result = await this.execCommand(
      ["git", "rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
      workDir,
    );
    const sha = result.output.trim();
    return result.success && sha.length > 0 ? sha : null;
  }

  /**
   * Changed-file list for `<baseRef>..HEAD`, in the same shape the two-tree
   * scan produced (`status` + `path` + `size`). Cost scales with the number of
   * changed files: git answers the name-status from its object store, and sizes
   * are resolved per changed file (stat for present files, `git cat-file -s` for
   * deletions) rather than by walking the whole tree.
   */
  async diffNameStatus(
    workDir: string,
    baseRef: string,
  ): Promise<ChangedFilesResult> {
    const result = await this.execCommand(
      ["git", "diff", "--name-status", "--no-renames", "-z", baseRef, "HEAD"],
      workDir,
    );
    if (!result.success) {
      throw new Error(`git diff --name-status failed: ${result.error}`);
    }

    const tokens = result.output.split("\0").filter((t) => t.length > 0);
    const files: FileChange[] = [];
    let added = 0;
    let modified = 0;
    let deleted = 0;

    for (let i = 0; i + 1 < tokens.length; i += 2) {
      const code = tokens[i].charAt(0);
      const path = tokens[i + 1];
      let status: FileChangeStatus;
      if (code === "A") {
        status = "added";
        added++;
      } else if (code === "D") {
        status = "deleted";
        deleted++;
      } else {
        // M (modified) and T (type change) both surface as a content change.
        status = "modified";
        modified++;
      }
      const size = await this.sizeForChange(workDir, baseRef, path, status);
      files.push({ path, status, size });
    }

    return { files, summary: { added, modified, deleted } };
  }

  /**
   * Best-effort byte size for a changed file. Present files (added/modified)
   * are stat-ed in the working tree; deletions are sized from the blob at
   * `<baseRef>`. Never fails the detection — falls back to 0.
   */
  private async sizeForChange(
    workDir: string,
    baseRef: string,
    path: string,
    status: FileChangeStatus,
  ): Promise<number> {
    try {
      if (status === "deleted") {
        const res = await this.execCommand(
          ["git", "cat-file", "-s", `${baseRef}:${path}`],
          workDir,
        );
        const n = parseInt(res.output.trim(), 10);
        return Number.isFinite(n) ? n : 0;
      }
      const full = this.os.path.join(workDir, path);
      if (await this.os.fs.existsAsync(full)) {
        const stat = await this.os.fs.statAsync(full);
        return stat.size;
      }
    } catch {
      // ignore — size is advisory
    }
    return 0;
  }

  /**
   * Per-file diff hunks for `<baseRef>..HEAD` limited to a single path. Reads
   * only that file from git's object store; added files diff against the empty
   * tree, deletions against `<baseRef>`. O(one file), independent of repo size.
   */
  async diffFileRange(
    workDir: string,
    baseRef: string,
    path: string,
  ): Promise<{ hunks: DiffHunk[]; isBinary: boolean }> {
    const proc = this.os.command.spawn(
      ["git", "diff", "--no-color", baseRef, "HEAD", "--", path],
      { cwd: workDir },
    );
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    if (exitCode > 1) {
      throw new Error(`git diff (file range) failed: ${stderr}`);
    }

    if (stdout.trim().length === 0) {
      return { hunks: [], isBinary: false };
    }
    const preview = parsePatchPreview(stdout);
    const file = preview.files[0];
    return { hunks: file?.hunks ?? [], isBinary: file?.isBinary ?? false };
  }

  /**
   * The "before" bytes of a path at a ref (`git show <ref>:<path>`). Used to
   * source the upstream-side content of a changed file without reading the
   * `upstream/` working tree. Returns `{ exists: false }` when the path is not
   * present at that ref (e.g. an added file at the baseline).
   */
  async showFileAtRef(
    workDir: string,
    ref: string,
    path: string,
  ): Promise<{ exists: boolean; content: string }> {
    const proc = this.os.command.spawn(["git", "show", `${ref}:${path}`], {
      cwd: workDir,
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    if (exitCode !== 0) {
      return { exists: false, content: "" };
    }
    return { exists: true, content: stdout };
  }

  /**
   * Advance the baseline past a set of selectively-committed paths (Decision
   * 2a: checkpoint commit). Builds, in a throwaway index, a tree equal to
   * `<baseRef>` with the committed paths brought to their `HEAD` content
   * (added/modified) or removed (deleted), commits it with `<baseRef>` as
   * parent, and returns the new baseline SHA. `HEAD` and the working tree are
   * untouched, so `newBaseline..HEAD` no longer reports the committed paths
   * while the remaining changes stay pending. Returns null on failure.
   */
  async advanceBaseline(
    workDir: string,
    baseRef: string,
    committedPaths: string[],
  ): Promise<string | null> {
    if (committedPaths.length === 0) return baseRef;

    const indexFile = this.os.path.join(
      workDir,
      ".git",
      `mimo-baseline-${Date.now()}.index`,
    );
    const env: Record<string, string> = { GIT_INDEX_FILE: indexFile };
    try {
      const readTree = await this.execCommand(
        ["git", "read-tree", baseRef],
        workDir,
        env,
      );
      if (!readTree.success) {
        logger.error(`[vcs] baseline read-tree failed: ${readTree.error}`);
        return null;
      }

      for (const path of committedPaths) {
        const lsTree = await this.execCommand(
          ["git", "ls-tree", "HEAD", "--", path],
          workDir,
        );
        const entry = lsTree.output.trim();
        if (entry.length > 0) {
          // Present at HEAD → bring the committed content into the baseline.
          const meta = entry.split("\t")[0].split(/\s+/);
          const mode = meta[0];
          const sha = meta[2];
          const update = await this.execCommand(
            [
              "git",
              "update-index",
              "--add",
              "--cacheinfo",
              `${mode},${sha},${path}`,
            ],
            workDir,
            env,
          );
          if (!update.success) {
            logger.error(`[vcs] baseline update-index failed: ${update.error}`);
            return null;
          }
        } else {
          // Absent at HEAD → the committed change was a deletion.
          const remove = await this.execCommand(
            ["git", "update-index", "--force-remove", path],
            workDir,
            env,
          );
          if (!remove.success) {
            logger.error(`[vcs] baseline force-remove failed: ${remove.error}`);
            return null;
          }
        }
      }

      const writeTree = await this.execCommand(
        ["git", "write-tree"],
        workDir,
        env,
      );
      if (!writeTree.success) {
        logger.error(`[vcs] baseline write-tree failed: ${writeTree.error}`);
        return null;
      }
      const tree = writeTree.output.trim();

      const commitEnv: Record<string, string> = {
        ...env,
        GIT_AUTHOR_NAME: "mimo",
        GIT_AUTHOR_EMAIL: "mimo@local",
        GIT_COMMITTER_NAME: "mimo",
        GIT_COMMITTER_EMAIL: "mimo@local",
      };
      const commitTree = await this.execCommand(
        [
          "git",
          "commit-tree",
          tree,
          "-p",
          baseRef,
          "-m",
          "mimo baseline checkpoint",
        ],
        workDir,
        commitEnv,
      );
      if (!commitTree.success) {
        logger.error(`[vcs] baseline commit-tree failed: ${commitTree.error}`);
        return null;
      }
      return commitTree.output.trim();
    } finally {
      if (await this.os.fs.existsAsync(indexFile)) {
        await this.os.fs.unlinkAsync(indexFile);
      }
    }
  }

  async storePatch(patchDir: string, patchContent: string): Promise<string> {
    if (!this.os.fs.exists(patchDir)) {
      this.os.fs.mkdir(patchDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const patchFile = this.os.path.join(patchDir, `${timestamp}.patch`);
    this.os.fs.writeFile(patchFile, patchContent, { encoding: "utf8" });
    return patchFile;
  }

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
      const patchContent = this.os.fs.readFile(patchFilePath, "utf8");
      const proc = this.os.command.spawn(
        ["patch", "-p1", "--no-backup-if-mismatch"],
        {
          cwd: upstreamPath,
          stdin: patchContent,
        },
      );

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

  async generateAndApplyPatch(
    agentWorkspacePath: string,
    upstreamPath: string,
    patchDir: string,
    repoType: "git" | "fossil",
  ): Promise<VCSResult & { patchPath?: string }> {
    const alignResult = await this.alignWorkspaceWithFossil(agentWorkspacePath);
    if (!alignResult.success) {
      return {
        success: false,
        error: `Alignment failed: ${alignResult.error}`,
      };
    }

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

    if (!genResult.patch) {
      return { success: true, output: "No changes" };
    }

    const patchPath = await this.storePatch(patchDir, genResult.patch);
    logger.debug(`[vcs] Patch stored: ${patchPath}`);

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

  private normalizePatchPaths(
    patch: string,
    upstreamDirName: string,
    agentDirName: string,
  ): string {
    return patch
      .replace(new RegExp(`^(diff --git a/)${upstreamDirName}/`, "gm"), "$1")
      .replace(new RegExp(`^(diff --git a/)${agentDirName}/`, "gm"), "$1")
      .replace(new RegExp(` b/${upstreamDirName}/`, "g"), " b/")
      .replace(new RegExp(` b/${agentDirName}/`, "g"), " b/")
      .replace(new RegExp(`^--- a/${upstreamDirName}/`, "gm"), "--- a/")
      .replace(new RegExp(`^--- a/${agentDirName}/`, "gm"), "--- a/")
      .replace(new RegExp(`^\\+\\+\\+ b/${upstreamDirName}/`, "gm"), "+++ b/")
      .replace(new RegExp(`^\\+\\+\\+ b/${agentDirName}/`, "gm"), "+++ b/")
      .replace(
        new RegExp(`^rename from ${upstreamDirName}/`, "gm"),
        "rename from ",
      )
      .replace(
        new RegExp(`^rename from ${agentDirName}/`, "gm"),
        "rename from ",
      )
      .replace(new RegExp(`^rename to ${upstreamDirName}/`, "gm"), "rename to ")
      .replace(new RegExp(`^rename to ${agentDirName}/`, "gm"), "rename to ")
      .replace(new RegExp(`^copy from ${upstreamDirName}/`, "gm"), "copy from ")
      .replace(new RegExp(`^copy from ${agentDirName}/`, "gm"), "copy from ")
      .replace(new RegExp(`^copy to ${upstreamDirName}/`, "gm"), "copy to ")
      .replace(new RegExp(`^copy to ${agentDirName}/`, "gm"), "copy to ");
  }

  private filterVcsMetadata(patch: string): string {
    const lines = patch.split("\n");
    const result: string[] = [];
    let skipCurrentFile = false;

    for (const line of lines) {
      if (line.startsWith("diff --git")) {
        const match = line.match(/^diff --git a\/(.+) b\//);
        skipCurrentFile = match ? isExcluded(match[1]) : false;
      }

      if (!skipCurrentFile) {
        result.push(line);
      }
    }

    return result.join("\n");
  }
}
