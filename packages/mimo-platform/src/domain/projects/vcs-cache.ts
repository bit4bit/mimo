// SPDX-License-Identifier: AGPL-3.0-only
import type { Credential } from "../credentials/repository.js";
import type { OS } from "../../infrastructure/os/types.js";
import { logger } from "../../logger.js";
import type { VCS } from "../vcs/index.js";

type RepoType = "git" | "fossil";

export interface CloneParams {
  projectId: string;
  repoUrl: string;
  repoType: RepoType;
  targetPath: string;
  credential?: Credential;
  branch?: string;
  clonePort?: number;
}

export interface RefreshParams {
  projectId: string;
  repoUrl: string;
  repoType: RepoType;
  credential?: Credential;
  clonePort?: number;
}

export interface ProjectVcsCache {
  clone(params: CloneParams): Promise<{ success: boolean; error?: string }>;
  refresh(params: RefreshParams): Promise<{ success: boolean; error?: string }>;
  clear(projectId: string, repoType: RepoType): Promise<void>;
}

interface CacheEngine {
  refresh(params: RefreshParams): Promise<{ success: boolean; error?: string }>;
  cloneFromCache(
    params: CloneParams,
  ): Promise<{ success: boolean; error?: string }>;
  clear(projectId: string): Promise<void>;
  isCorrupted(projectId: string): Promise<boolean>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withProjectLock<T>(
  os: OS,
  projectPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockPath = os.path.join(projectPath, ".cache.lock");
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      os.fs.mkdir(lockPath);
      break;
    } catch {
      if (attempt === 49) {
        throw new Error("Timed out waiting for project cache lock");
      }
      await sleep(100);
    }
  }

  try {
    return await fn();
  } finally {
    if (os.fs.exists(lockPath)) {
      os.fs.rm(lockPath, { recursive: true, force: true });
    }
  }
}

function buildGitSshCommand(sshKeyPath?: string, clonePort?: number): string {
  const parts = ["ssh"];
  if (sshKeyPath) {
    parts.push(`-i "${sshKeyPath}"`, "-o IdentitiesOnly=yes");
  }
  parts.push("-o StrictHostKeyChecking=no", "-o UserKnownHostsFile=/dev/null");
  if (clonePort != null) {
    parts.push(`-p ${clonePort}`);
  }
  return parts.join(" ");
}

function normalizePrivateKey(privateKey: string): string {
  let normalizedPrivateKey = privateKey.trim();
  if (
    (normalizedPrivateKey.startsWith('"') &&
      normalizedPrivateKey.endsWith('"')) ||
    (normalizedPrivateKey.startsWith("'") && normalizedPrivateKey.endsWith("'"))
  ) {
    normalizedPrivateKey = normalizedPrivateKey.slice(1, -1);
  }
  normalizedPrivateKey = normalizedPrivateKey
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\n/g, "\n");

  if (!normalizedPrivateKey.endsWith("\n")) {
    normalizedPrivateKey += "\n";
  }

  return normalizedPrivateKey;
}

function isSshUrl(url: string): boolean {
  return /^(git@|ssh:\/\/)/.test(url);
}

function injectHttpsCredentials(url: string, credential: Credential): string {
  if (credential.type !== "https") {
    return url;
  }

  const encodedUsername = encodeURIComponent(credential.username);
  const encodedPassword = encodeURIComponent(credential.password);
  return url.replace(
    /^(https:\/\/)(.*)$/,
    `$1${encodedUsername}:${encodedPassword}@$2`,
  );
}

function cachePathFor(
  os: OS,
  projectsPath: string,
  projectId: string,
  repoType: RepoType,
): string {
  const projectPath = os.path.join(projectsPath, projectId);
  return repoType === "git"
    ? os.path.join(projectPath, "cache.git")
    : os.path.join(projectPath, "cache.fossil");
}

function normalizeAuthError(error?: string): string | undefined {
  const message = (error ?? "").toLowerCase();
  if (
    message.includes("auth") ||
    message.includes("authentication") ||
    message.includes("permission denied") ||
    message.includes("could not read from remote repository")
  ) {
    return "Authentication failed while refreshing project cache";
  }
  return undefined;
}

class GitCacheEngine implements CacheEngine {
  constructor(
    private readonly os: OS,
    private readonly projectsPath: string,
  ) {}

  private async withSshEnv<T>(
    credential: Credential | undefined,
    projectId: string,
    clonePort: number | undefined,
    fn: (env: Record<string, string> | undefined) => Promise<T>,
  ): Promise<T> {
    if (credential?.type !== "ssh" && clonePort == null) {
      return fn(undefined);
    }

    let sshKeyPath: string | undefined;
    if (credential?.type === "ssh") {
      sshKeyPath = this.os.path.join(
        this.os.path.tempDir(),
        `mimo-cache-key-${projectId}-${Date.now()}`,
      );
      this.os.fs.writeFile(
        sshKeyPath,
        normalizePrivateKey(credential.privateKey),
        { mode: 0o600, encoding: "utf-8" },
      );
      this.os.fs.chmod(sshKeyPath, 0o600);
    }

    const parentEnv = this.os.env.getAll();
    const filteredParent = Object.fromEntries(
      Object.entries(parentEnv).filter(([, v]) => v !== undefined),
    ) as Record<string, string>;
    const env = {
      ...filteredParent,
      GIT_SSH_COMMAND: buildGitSshCommand(sshKeyPath, clonePort),
    };

    try {
      return await fn(env);
    } finally {
      if (sshKeyPath && this.os.fs.exists(sshKeyPath)) {
        this.os.fs.unlink(sshKeyPath);
      }
    }
  }

  async refresh(
    params: RefreshParams,
  ): Promise<{ success: boolean; error?: string }> {
    const cachePath = cachePathFor(
      this.os,
      this.projectsPath,
      params.projectId,
      "git",
    );
    const projectPath = this.os.path.dirname(cachePath);

    return withProjectLock(this.os, projectPath, async () => {
      let url = params.repoUrl;
      if (params.credential?.type === "https" && !isSshUrl(params.repoUrl)) {
        url = injectHttpsCredentials(params.repoUrl, params.credential);
      }

      return this.withSshEnv(
        params.credential,
        params.projectId,
        params.clonePort,
        async (env) => {
          if (!this.os.fs.exists(cachePath)) {
            logger.info("[cache] creating git cache", {
              projectId: params.projectId,
            });
            const clone = await this.os.command.run(
              ["git", "clone", "--bare", url, cachePath],
              { env, timeoutMs: 300000 },
            );
            if (!clone.success) {
              return {
                success: false,
                error: clone.error || "Failed to create git cache",
              };
            }
            return { success: true };
          }

          const fsck = await this.os.command.run(["git", "fsck"], {
            cwd: cachePath,
            env,
            timeoutMs: 120000,
          });
          if (!fsck.success) {
            logger.warn("[cache] git cache corruption detected", {
              projectId: params.projectId,
            });
            await this.clear(params.projectId);
            const reclone = await this.os.command.run(
              ["git", "clone", "--bare", url, cachePath],
              { env, timeoutMs: 300000 },
            );
            return reclone.success
              ? { success: true }
              : {
                  success: false,
                  error: reclone.error || "Failed to rebuild git cache",
                };
          }

          logger.debug("[cache] refreshing git cache", {
            projectId: params.projectId,
          });
          const fetch = await this.os.command.run(["git", "fetch", "--all"], {
            cwd: cachePath,
            env,
            timeoutMs: 180000,
          });
          return fetch.success
            ? { success: true }
            : {
                success: false,
                error: fetch.error || "Failed to refresh git cache",
              };
        },
      );
    });
  }

  async cloneFromCache(
    params: CloneParams,
  ): Promise<{ success: boolean; error?: string }> {
    const cachePath = cachePathFor(
      this.os,
      this.projectsPath,
      params.projectId,
      "git",
    );

    return this.withSshEnv(
      params.credential,
      params.projectId,
      params.clonePort,
      async (env) => {
        const args = ["git", "clone", "--reference", cachePath];
        if (params.branch) {
          args.push("--branch", params.branch);
        }
        args.push(params.repoUrl, params.targetPath);

        const result = await this.os.command.run(args, {
          env,
          timeoutMs: 300000,
        });
        return result.success
          ? { success: true }
          : {
              success: false,
              error: result.error || "Failed to clone from git cache",
            };
      },
    );
  }

  async clear(projectId: string): Promise<void> {
    const cachePath = cachePathFor(
      this.os,
      this.projectsPath,
      projectId,
      "git",
    );
    if (this.os.fs.exists(cachePath)) {
      logger.info("[cache] clearing git cache", { projectId });
      this.os.fs.rm(cachePath, { recursive: true, force: true });
    }
  }

  async isCorrupted(projectId: string): Promise<boolean> {
    const cachePath = cachePathFor(
      this.os,
      this.projectsPath,
      projectId,
      "git",
    );
    if (!this.os.fs.exists(cachePath)) {
      return false;
    }
    const result = await this.os.command.run(["git", "fsck"], {
      cwd: cachePath,
      timeoutMs: 120000,
    });
    return !result.success;
  }
}

class FossilCacheEngine implements CacheEngine {
  constructor(
    private readonly os: OS,
    private readonly projectsPath: string,
  ) {}

  async refresh(
    params: RefreshParams,
  ): Promise<{ success: boolean; error?: string }> {
    const cachePath = cachePathFor(
      this.os,
      this.projectsPath,
      params.projectId,
      "fossil",
    );
    const projectPath = this.os.path.dirname(cachePath);

    return withProjectLock(this.os, projectPath, async () => {
      if (!this.os.fs.exists(cachePath)) {
        logger.info("[cache] creating fossil cache", {
          projectId: params.projectId,
        });
        const clone = await this.os.command.run(
          ["fossil", "clone", params.repoUrl, cachePath],
          {
            timeoutMs: 300000,
          },
        );
        return clone.success
          ? { success: true }
          : {
              success: false,
              error: clone.error || "Failed to create fossil cache",
            };
      }

      const verify = await this.os.command.run(
        ["fossil", "verify", cachePath],
        {
          timeoutMs: 120000,
        },
      );
      if (!verify.success) {
        logger.warn("[cache] fossil cache corruption detected", {
          projectId: params.projectId,
        });
        await this.clear(params.projectId);
        const reclone = await this.os.command.run(
          ["fossil", "clone", params.repoUrl, cachePath],
          {
            timeoutMs: 300000,
          },
        );
        return reclone.success
          ? { success: true }
          : {
              success: false,
              error: reclone.error || "Failed to rebuild fossil cache",
            };
      }

      logger.debug("[cache] refreshing fossil cache", {
        projectId: params.projectId,
      });
      const sync = await this.os.command.run(
        ["fossil", "sync", "-R", cachePath],
        {
          timeoutMs: 180000,
        },
      );
      return sync.success
        ? { success: true }
        : {
            success: false,
            error: sync.error || "Failed to refresh fossil cache",
          };
    });
  }

  async cloneFromCache(
    params: CloneParams,
  ): Promise<{ success: boolean; error?: string }> {
    this.os.fs.mkdir(params.targetPath, { recursive: true });
    const open = await this.os.command.run([
      "fossil",
      "open",
      cachePathFor(this.os, this.projectsPath, params.projectId, "fossil"),
      "--workdir",
      params.targetPath,
      "--nested",
      "--force",
    ]);

    if (!open.success) {
      return {
        success: false,
        error: open.error || "Failed to open from fossil cache",
      };
    }

    if (!params.branch) {
      return { success: true };
    }

    const checkout = await this.os.command.run(
      ["fossil", "checkout", params.branch],
      {
        cwd: params.targetPath,
      },
    );
    return checkout.success
      ? { success: true }
      : {
          success: false,
          error: checkout.error || `Failed to checkout '${params.branch}'`,
        };
  }

  async clear(projectId: string): Promise<void> {
    const cachePath = cachePathFor(
      this.os,
      this.projectsPath,
      projectId,
      "fossil",
    );
    if (this.os.fs.exists(cachePath)) {
      logger.info("[cache] clearing fossil cache", { projectId });
      this.os.fs.unlink(cachePath);
    }
  }

  async isCorrupted(projectId: string): Promise<boolean> {
    const cachePath = cachePathFor(
      this.os,
      this.projectsPath,
      projectId,
      "fossil",
    );
    if (!this.os.fs.exists(cachePath)) {
      return false;
    }
    const result = await this.os.command.run(["fossil", "verify", cachePath], {
      timeoutMs: 120000,
    });
    return !result.success;
  }
}

export function createProjectVcsCache(deps: {
  os: OS;
  projectsPath: string;
  vcs: VCS;
}): ProjectVcsCache {
  const gitEngine = new GitCacheEngine(deps.os, deps.projectsPath);
  const fossilEngine = new FossilCacheEngine(deps.os, deps.projectsPath);

  const engineFor = (repoType: RepoType): CacheEngine =>
    repoType === "git" ? gitEngine : fossilEngine;

  return {
    async clone(
      params: CloneParams,
    ): Promise<{ success: boolean; error?: string }> {
      const engine = engineFor(params.repoType);
      const refreshResult = await engine.refresh(params);
      if (!refreshResult.success) {
        const authError = normalizeAuthError(refreshResult.error);
        if (authError) {
          return { success: false, error: authError };
        }
        logger.warn("[cache] refresh failed, falling back to direct clone", {
          projectId: params.projectId,
          error: refreshResult.error,
        });
        const fallback = await deps.vcs.cloneRepository(
          params.repoUrl,
          params.repoType,
          params.targetPath,
          params.credential,
          params.branch,
          params.clonePort,
        );
        return fallback.success
          ? { success: true }
          : { success: false, error: fallback.error };
      }
      const cloneResult = await engine.cloneFromCache(params);
      if (cloneResult.success) {
        return cloneResult;
      }

      logger.warn(
        "[cache] clone from cache failed, retrying with cache reset",
        {
          projectId: params.projectId,
          error: cloneResult.error,
        },
      );
      await engine.clear(params.projectId);
      const retryRefresh = await engine.refresh(params);
      if (retryRefresh.success) {
        const retryClone = await engine.cloneFromCache(params);
        if (retryClone.success) {
          return retryClone;
        }
      }

      const fallback = await deps.vcs.cloneRepository(
        params.repoUrl,
        params.repoType,
        params.targetPath,
        params.credential,
        params.branch,
        params.clonePort,
      );
      return fallback.success
        ? { success: true }
        : { success: false, error: fallback.error || cloneResult.error };
    },
    async refresh(
      params: RefreshParams,
    ): Promise<{ success: boolean; error?: string }> {
      return engineFor(params.repoType).refresh(params);
    },
    async clear(projectId: string, repoType: RepoType): Promise<void> {
      await engineFor(repoType).clear(projectId);
    },
  };
}
