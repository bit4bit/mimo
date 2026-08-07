// SPDX-License-Identifier: AGPL-3.0-only
import type { Credential } from "../credentials/repository.js";
import type { OS } from "../../infrastructure/os/types.js";
import { logger } from "../../logger.js";
import type { VCS } from "../vcs/index.js";
import {
  buildGitSshCommand,
  injectHttpsCredentials,
  isSshRepoUrl,
  normalizeSshPrivateKey,
} from "../vcs/credential-injection.js";

type RepoType = "git" | "fossil";

export interface CloneParams {
  projectId: string;
  repoId?: string;
  repoUrl: string;
  repoType: RepoType;
  targetPath: string;
  credential?: Credential;
  branch?: string;
  clonePort?: number;
}

export interface RefreshParams {
  projectId: string;
  repoId?: string;
  repoUrl: string;
  repoType: RepoType;
  credential?: Credential;
  clonePort?: number;
  branch?: string;
}

export interface ProjectVcsCache {
  clone(params: CloneParams): Promise<{ success: boolean; error?: string }>;
  refresh(params: RefreshParams): Promise<{ success: boolean; error?: string }>;
  clear(projectId: string, repoType: RepoType, repoId?: string): Promise<void>;
}

interface CacheEngine {
  refresh(params: RefreshParams): Promise<{ success: boolean; error?: string }>;
  cloneFromCache(
    params: CloneParams,
  ): Promise<{ success: boolean; error?: string }>;
  clear(projectId: string, repoId?: string): Promise<void>;
  isCorrupted(projectId: string, repoId?: string): Promise<boolean>;
}

function gitBranchArgs(branch?: string): string[] {
  return branch ? ["--branch", branch] : [];
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

function sanitizeRepoId(repoId: string): string {
  return repoId.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function cachePathFor(
  os: OS,
  projectsPath: string,
  projectId: string,
  repoType: RepoType,
  repoId?: string,
): string {
  const projectPath = os.path.join(projectsPath, projectId);
  const extension = repoType === "git" ? "git" : "fossil";
  return os.path.join(
    projectPath,
    repoId
      ? `cache-${sanitizeRepoId(repoId)}.${extension}`
      : `cache.${extension}`,
  );
}

function clearCacheArtifacts(
  os: OS,
  projectsPath: string,
  projectId: string,
  repoType: RepoType,
  repoId?: string,
): void {
  const projectPath = os.path.join(projectsPath, projectId);
  if (repoId) {
    const cachePath = cachePathFor(
      os,
      projectsPath,
      projectId,
      repoType,
      repoId,
    );
    if (os.fs.exists(cachePath)) {
      os.fs.rm(cachePath, { recursive: true, force: true });
    }
    return;
  }

  const legacyPath = cachePathFor(os, projectsPath, projectId, repoType);
  if (os.fs.exists(legacyPath)) {
    os.fs.rm(legacyPath, { recursive: true, force: true });
  }
  if (!os.fs.exists(projectPath)) {
    return;
  }
  const extension = repoType === "git" ? ".git" : ".fossil";
  for (const entry of os.fs.readdir(projectPath) as string[]) {
    if (entry.startsWith("cache-") && entry.endsWith(extension)) {
      os.fs.rm(os.path.join(projectPath, entry), {
        recursive: true,
        force: true,
      });
    }
  }
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
        normalizeSshPrivateKey(credential.privateKey),
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
      params.repoId,
    );
    const projectPath = this.os.path.dirname(cachePath);

    return withProjectLock(this.os, projectPath, async () => {
      let url = params.repoUrl;
      if (
        params.credential?.type === "https" &&
        !isSshRepoUrl(params.repoUrl)
      ) {
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
              repoUrl: params.repoUrl,
              branch: params.branch ?? "default",
            });
            const start = Date.now();
            const clone = await this.os.command.run(
              [
                "git",
                "clone",
                "--bare",
                "--depth=1",
                "--single-branch",
                "--quiet",
                ...gitBranchArgs(params.branch),
                url,
                cachePath,
              ],
              { env, timeoutMs: 300000 },
            );
            logger.info("[cache] git cache clone finished", {
              projectId: params.projectId,
              branch: params.branch ?? "default",
              success: clone.success,
              durationMs: Date.now() - start,
            });
            if (!clone.success) {
              return {
                success: false,
                error: clone.error || "Failed to create git cache",
              };
            }
            return { success: true };
          }

          logger.debug("[cache] verifying git cache", {
            projectId: params.projectId,
          });
          const fsckStart = Date.now();
          const fsck = await this.os.command.run(["git", "fsck"], {
            cwd: cachePath,
            env,
            timeoutMs: 120000,
          });
          logger.debug("[cache] git fsck finished", {
            projectId: params.projectId,
            success: fsck.success,
            durationMs: Date.now() - fsckStart,
          });
          if (!fsck.success) {
            logger.warn("[cache] git cache corruption detected", {
              projectId: params.projectId,
            });
            await this.clear(params.projectId);
            const recloneStart = Date.now();
            const reclone = await this.os.command.run(
              [
                "git",
                "clone",
                "--bare",
                "--depth=1",
                "--single-branch",
                "--quiet",
                ...gitBranchArgs(params.branch),
                url,
                cachePath,
              ],
              { env, timeoutMs: 300000 },
            );
            logger.info("[cache] git cache reclone finished", {
              projectId: params.projectId,
              branch: params.branch ?? "default",
              success: reclone.success,
              durationMs: Date.now() - recloneStart,
            });
            return reclone.success
              ? { success: true }
              : {
                  success: false,
                  error: reclone.error || "Failed to rebuild git cache",
                };
          }

          logger.debug("[cache] refreshing git cache", {
            projectId: params.projectId,
            branch: params.branch ?? "default",
          });
          const fetchStart = Date.now();
          let fetch = await this.os.command.run(
            params.branch
              ? [
                  "git",
                  "fetch",
                  "--depth=1",
                  "--quiet",
                  "origin",
                  params.branch,
                ]
              : ["git", "fetch", "--all", "--quiet"],
            {
              cwd: cachePath,
              env,
              timeoutMs: 180000,
              stdio: "ignore",
            },
          );
          // Shallow single-branch caches may not know about other branches.
          // Teach the remote about the requested branch and retry once.
          if (!fetch.success && params.branch) {
            logger.debug("[cache] widening remote refspec for branch", {
              projectId: params.projectId,
              branch: params.branch,
            });
            await this.os.command.run(
              ["git", "remote", "set-branches", "origin", params.branch],
              { cwd: cachePath, env, stdio: "ignore" },
            );
            fetch = await this.os.command.run(
              ["git", "fetch", "--depth=1", "--quiet", "origin", params.branch],
              {
                cwd: cachePath,
                env,
                timeoutMs: 180000,
                stdio: "ignore",
              },
            );
          }
          logger.info("[cache] git fetch finished", {
            projectId: params.projectId,
            branch: params.branch ?? "default",
            success: fetch.success,
            durationMs: Date.now() - fetchStart,
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
      params.repoId,
    );

    return this.withSshEnv(
      params.credential,
      params.projectId,
      params.clonePort,
      async (env) => {
        // Clone from the local cache as the remote. This avoids the fragility
        // of `--reference` combined with shallow repositories, while still
        // transferring no objects over the network.
        const localCacheUrl = `file://${cachePath}`;
        const args = [
          "git",
          "clone",
          "--depth=1",
          "--quiet",
          "--single-branch",
          ...gitBranchArgs(params.branch),
          localCacheUrl,
          params.targetPath,
        ];

        logger.debug("[cache] cloning from local cache", {
          projectId: params.projectId,
          branch: params.branch ?? "default",
          cachePath,
          targetPath: params.targetPath,
        });
        const clone = await this.os.command.run(args, {
          env,
          timeoutMs: 300000,
          stdio: "pipe",
        });
        logger.debug("[cache] local cache clone command finished", {
          projectId: params.projectId,
          branch: params.branch ?? "default",
          success: clone.success,
          output: clone.output,
          error: clone.error,
        });
        if (!clone.success) {
          return {
            success: false,
            error: clone.error || "Failed to clone from git cache",
          };
        }

        // The checkout's origin now points to the local cache. Rewrite it to
        // the real upstream URL so push/fetch work later, then do a cheap
        // fetch to make sure we have the remote refs.
        const remoteUrlResult = await this.os.command.run(
          ["git", "remote", "set-url", "origin", params.repoUrl],
          { cwd: params.targetPath, env, stdio: "pipe" },
        );
        if (!remoteUrlResult.success) {
          return {
            success: false,
            error:
              remoteUrlResult.error || "Failed to set origin to remote URL",
          };
        }

        const fetchResult = await this.os.command.run(
          params.branch
            ? ["git", "fetch", "--depth=1", "--quiet", "origin", params.branch]
            : ["git", "fetch", "--depth=1", "--quiet", "origin"],
          { cwd: params.targetPath, env, stdio: "pipe" },
        );
        if (!fetchResult.success) {
          return {
            success: false,
            error: fetchResult.error || "Failed to fetch from remote origin",
          };
        }

        return { success: true };
      },
    );
  }

  async clear(projectId: string, repoId?: string): Promise<void> {
    logger.info("[cache] clearing git cache", { projectId, repoId });
    clearCacheArtifacts(this.os, this.projectsPath, projectId, "git", repoId);
  }

  async isCorrupted(projectId: string, repoId?: string): Promise<boolean> {
    const cachePath = cachePathFor(
      this.os,
      this.projectsPath,
      projectId,
      "git",
      repoId,
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
      params.repoId,
    );
    const projectPath = this.os.path.dirname(cachePath);

    return withProjectLock(this.os, projectPath, async () => {
      if (!this.os.fs.exists(cachePath)) {
        logger.info("[cache] creating fossil cache", {
          projectId: params.projectId,
          repoUrl: params.repoUrl,
        });
        const start = Date.now();
        const clone = await this.os.command.run(
          ["fossil", "clone", params.repoUrl, cachePath],
          {
            timeoutMs: 300000,
          },
        );
        logger.info("[cache] fossil cache clone finished", {
          projectId: params.projectId,
          success: clone.success,
          durationMs: Date.now() - start,
        });
        return clone.success
          ? { success: true }
          : {
              success: false,
              error: clone.error || "Failed to create fossil cache",
            };
      }

      logger.debug("[cache] verifying fossil cache", {
        projectId: params.projectId,
      });
      const verifyStart = Date.now();
      const verify = await this.os.command.run(
        ["fossil", "verify", cachePath],
        {
          timeoutMs: 120000,
        },
      );
      logger.debug("[cache] fossil verify finished", {
        projectId: params.projectId,
        success: verify.success,
        durationMs: Date.now() - verifyStart,
      });
      if (!verify.success) {
        logger.warn("[cache] fossil cache corruption detected", {
          projectId: params.projectId,
        });
        await this.clear(params.projectId);
        const recloneStart = Date.now();
        const reclone = await this.os.command.run(
          ["fossil", "clone", params.repoUrl, cachePath],
          {
            timeoutMs: 300000,
          },
        );
        logger.info("[cache] fossil cache reclone finished", {
          projectId: params.projectId,
          success: reclone.success,
          durationMs: Date.now() - recloneStart,
        });
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
      const syncStart = Date.now();
      const sync = await this.os.command.run(
        ["fossil", "sync", "-R", cachePath],
        {
          timeoutMs: 180000,
        },
      );
      logger.info("[cache] fossil sync finished", {
        projectId: params.projectId,
        success: sync.success,
        durationMs: Date.now() - syncStart,
      });
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
      cachePathFor(
        this.os,
        this.projectsPath,
        params.projectId,
        "fossil",
        params.repoId,
      ),
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

  async clear(projectId: string, repoId?: string): Promise<void> {
    logger.info("[cache] clearing fossil cache", { projectId, repoId });
    clearCacheArtifacts(
      this.os,
      this.projectsPath,
      projectId,
      "fossil",
      repoId,
    );
  }

  async isCorrupted(projectId: string, repoId?: string): Promise<boolean> {
    const cachePath = cachePathFor(
      this.os,
      this.projectsPath,
      projectId,
      "fossil",
      repoId,
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
      logger.debug("[cache] starting session clone", {
        projectId: params.projectId,
        repoUrl: params.repoUrl,
        repoType: params.repoType,
        branch: params.branch ?? "default",
        targetPath: params.targetPath,
      });

      // Refresh the project cache first. This validates credentials and
      // keeps the cache warm for any tooling that reads it.
      const refreshResult = await engine.refresh(params);
      if (!refreshResult.success) {
        const authError = normalizeAuthError(refreshResult.error);
        if (authError) {
          logger.warn("[cache] refresh auth error", {
            projectId: params.projectId,
            error: authError,
          });
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

      // For Git, clone the session upstream directly from the remote.
      // Cloning a shallow working tree from a local bare cache is
      // consistently slower than a fresh shallow clone from the remote in
      // this environment, so we avoid the local cache clone path for git.
      // Fossil still uses the cache-assisted open path.
      if (params.repoType === "git") {
        logger.debug(
          "[cache] refresh succeeded, cloning directly from remote",
          {
            projectId: params.projectId,
            branch: params.branch ?? "default",
          },
        );
        const cloneResult = await deps.vcs.cloneRepository(
          params.repoUrl,
          params.repoType,
          params.targetPath,
          params.credential,
          params.branch,
          params.clonePort,
        );

        if (cloneResult.success) {
          logger.debug("[cache] direct remote clone succeeded", {
            projectId: params.projectId,
          });
          return { success: true };
        }

        logger.warn(
          "[cache] direct remote clone failed, clearing cache and retrying",
          {
            projectId: params.projectId,
            error: cloneResult.error,
          },
        );
        await engine.clear(params.projectId, params.repoId);
        const retryClone = await deps.vcs.cloneRepository(
          params.repoUrl,
          params.repoType,
          params.targetPath,
          params.credential,
          params.branch,
          params.clonePort,
        );
        return retryClone.success
          ? { success: true }
          : {
              success: false,
              error: retryClone.error || cloneResult.error,
            };
      }

      logger.debug("[cache] refresh succeeded, cloning from cache", {
        projectId: params.projectId,
        branch: params.branch ?? "default",
      });
      const cloneResult = await engine.cloneFromCache(params);
      if (cloneResult.success) {
        logger.debug("[cache] clone from cache succeeded", {
          projectId: params.projectId,
        });
        return cloneResult;
      }

      logger.warn(
        "[cache] clone from cache failed, retrying with cache reset",
        {
          projectId: params.projectId,
          error: cloneResult.error,
        },
      );
      await engine.clear(params.projectId, params.repoId);
      const retryRefresh = await engine.refresh(params);
      if (retryRefresh.success) {
        const retryClone = await engine.cloneFromCache(params);
        if (retryClone.success) {
          logger.debug("[cache] retry clone from cache succeeded", {
            projectId: params.projectId,
          });
          return retryClone;
        }
      }

      logger.warn("[cache] retry failed, falling back to direct clone", {
        projectId: params.projectId,
        refreshError: retryRefresh.error,
        cloneError: cloneResult.error,
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
        : { success: false, error: fallback.error || cloneResult.error };
    },
    async refresh(
      params: RefreshParams,
    ): Promise<{ success: boolean; error?: string }> {
      return engineFor(params.repoType).refresh(params);
    },
    async clear(
      projectId: string,
      repoType: RepoType,
      repoId?: string,
    ): Promise<void> {
      await engineFor(repoType).clear(projectId, repoId);
    },
  };
}
