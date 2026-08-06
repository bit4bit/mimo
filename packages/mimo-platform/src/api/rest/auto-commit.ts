// SPDX-License-Identifier: AGPL-3.0-only
/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { createAuthMiddleware } from "../../auth/middleware.js";
import type { OS } from "../../infrastructure/os/types.js";
import type { AutoCommitService } from "../../domain/auto-commit/service.js";
import type { VCS } from "../../domain/vcs/index.js";
import type { JwtService } from "../../domain/auth/jwt.js";

type PendingAgentSync = {
  resolve: (value: {
    requestId: string;
    sessionId: string;
    success: boolean;
    message: string;
    error?: string;
    noChanges?: boolean;
  }) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const pendingAgentSyncs = new Map<string, PendingAgentSync>();

export interface AgentSyncNowResponse {
  success: boolean;
  message: string;
  error?: string;
  noChanges?: boolean;
  syncStatus: Awaited<ReturnType<AutoCommitService["getSyncStatus"]>>;
  statusCode: 200 | 400 | 404 | 500 | 503;
}

export interface AutoCommitRouterContext {
  autoCommitService: AutoCommitService;
  sessionRepository: {
    findById: (sessionId: string) => Promise<any | null>;
    update: (
      sessionId: string,
      updates: Record<string, unknown>,
    ) => Promise<any | null>;
    getSessionRepoPath: (sessionId: string, repoId?: string) => string;
  };
  agentService: {
    getAgentConnection: (agentId: string) => any;
  };
  sccService: {
    invalidateCache: (path: string) => void;
  };
  vcs: VCS;
  os: OS;
  auth: Pick<JwtService, "verifyToken">;
}

export function resolveAgentSyncNowResult(result: {
  requestId?: string;
  sessionId?: string;
  success?: boolean;
  message?: string;
  error?: string;
  noChanges?: boolean;
}): boolean {
  if (!result.requestId) {
    return false;
  }

  const pending = pendingAgentSyncs.get(result.requestId);
  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeout);
  pendingAgentSyncs.delete(result.requestId);
  pending.resolve({
    requestId: result.requestId,
    sessionId: result.sessionId || "",
    success: Boolean(result.success),
    message:
      result.message || (result.success ? "Sync completed" : "Sync failed"),
    error: result.error,
    noChanges: result.noChanges,
  });
  return true;
}

export async function syncSessionViaAssignedAgent(
  sessionId: string,
  context: AutoCommitRouterContext,
): Promise<AgentSyncNowResponse> {
  const session = await context.sessionRepository.findById(sessionId);

  if (!session) {
    return {
      success: false,
      message: "Session not found",
      error: "Session not found",
      syncStatus: null,
      statusCode: 404,
    };
  }

  // Get assigned agent from session (backward compatibility) or active chat thread
  let assignedAgentId: string | null | undefined = session.assignedAgentId;
  if (!assignedAgentId && session.chatThreads?.length > 0) {
    const activeThread = session.activeChatThreadId
      ? session.chatThreads.find((t) => t.id === session.activeChatThreadId)
      : session.chatThreads[0];
    assignedAgentId = activeThread?.assignedAgentId;
  }

  if (!assignedAgentId) {
    return {
      success: false,
      message: "No agent assigned to this session",
      error: "No agent assigned to this session",
      syncStatus: await context.autoCommitService.getSyncStatus(sessionId),
      statusCode: 400,
    };
  }

  const agentWs = context.agentService.getAgentConnection(assignedAgentId);
  if (!agentWs || agentWs.readyState !== 1) {
    return {
      success: false,
      message: "Assigned agent is offline",
      error: "Assigned agent is offline",
      syncStatus: await context.autoCommitService.getSyncStatus(sessionId),
      statusCode: 503,
    };
  }

  await context.sessionRepository.update(sessionId, {
    syncState: "syncing",
    lastSyncError: undefined,
  });

  const requestId = randomUUID();
  const agentResultPromise = new Promise<{
    requestId: string;
    sessionId: string;
    success: boolean;
    message: string;
    error?: string;
    noChanges?: boolean;
  }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingAgentSyncs.delete(requestId);
      reject(new Error("Timed out waiting for mimo-agent sync result"));
    }, 30000);

    pendingAgentSyncs.set(requestId, { resolve, timeout });
  });

  let agentResult: {
    requestId: string;
    sessionId: string;
    success: boolean;
    message: string;
    error?: string;
    noChanges?: boolean;
  };

  try {
    agentWs.send(
      JSON.stringify({
        type: "sync_now",
        sessionId,
        requestId,
      }),
    );

    agentResult = await agentResultPromise;

    if (agentResult.success) {
      if (!agentResult.noChanges) {
        const sessionRepos = Array.isArray(session.repos)
          ? session.repos
          : [];

        if (sessionRepos.length > 0) {
          // Fan out per repository: ensure each platform-side checkout exists,
          // then pull it so every repo's workspace reflects the agent's push.
          for (const repo of sessionRepos) {
            let repoPath = context.sessionRepository.getSessionRepoPath(
              sessionId,
              repo.projectRepoId,
            );
            // Legacy single-repo sessions seed the bare repo without a repoId
            // suffix, even though their repos entry uses projectRepoId
            // "default".
            if (
              !context.os.fs.exists(repoPath) &&
              repo.projectRepoId === "default"
            ) {
              repoPath = context.sessionRepository.getSessionRepoPath(sessionId);
            }
            const gitDirPath = context.os.path.join(
              repo.workspacePath,
              ".git",
            );

            if (context.os.fs.exists(repoPath)) {
              if (!context.os.fs.exists(gitDirPath)) {
                const cloneResult = await context.vcs.clonePlatformCheckout(
                  repoPath,
                  repo.workspacePath,
                );
                if (!cloneResult.success) {
                  throw new Error(
                    cloneResult.error ||
                      `Failed to clone local git checkout for repo ${repo.projectRepoId}`,
                  );
                }
              }

              const upResult = await context.vcs.gitPull(repo.workspacePath);
              if (!upResult.success) {
                throw new Error(
                  upResult.error ||
                    `Failed to refresh workspace for repo ${repo.projectRepoId}`,
                );
              }
            }
          }
        } else {
          const repoPath =
            context.sessionRepository.getSessionRepoPath(sessionId);
          const checkoutMarkerPath = context.os.path.join(
            session.agentWorkspacePath,
            ".git",
          );

          if (!context.os.fs.exists(checkoutMarkerPath)) {
            const cloneResult = await context.vcs.clonePlatformCheckout(
              repoPath,
              session.agentWorkspacePath,
            );
            if (!cloneResult.success) {
              throw new Error(
                cloneResult.error || "Failed to clone local git checkout",
              );
            }
          }

          const upResult = await context.vcs.gitPull(session.agentWorkspacePath);
          if (!upResult.success) {
            throw new Error(
              upResult.error ||
                "Failed to refresh local agent workspace from git",
            );
          }
        }

        context.sccService.invalidateCache(session.agentWorkspacePath);

        // Initialize the git-range `baseline` once, the first time the platform
        // establishes its checkout. The baseline is the seeded base commit —
        // the upstream state before any agent work — which the upstream checkout
        // still points at here (it is mutated only by selective commits, which
        // cannot have run yet). Recording its SHA lets the commit preview and
        // impact buffer use the native `<baseline>..HEAD` range. Skipped when
        // the upstream is not a resolvable git checkout (falls back to the
        // two-tree scan) and never overwrites an already-advanced baseline.
        // NOTE: this is the interim seed hook; the native git seed site from
        // `replace-fossil-with-git` should record `baseline` directly from
        // `seedSessionRepo`'s returned commit hash once it lands.
        if (!session.baseline) {
          const seed = await context.vcs.revParse(session.upstreamPath, "HEAD");
          if (
            seed &&
            (await context.vcs.revParse(session.agentWorkspacePath, seed))
          ) {
            await context.sessionRepository.update(sessionId, {
              baseline: seed,
            });
          }
        }
      }

      await context.sessionRepository.update(sessionId, {
        syncState: "idle",
        lastSyncAt: new Date().toISOString(),
        lastSyncError: undefined,
      });
    } else {
      await context.sessionRepository.update(sessionId, {
        syncState: "error",
        lastSyncError:
          agentResult.error || agentResult.message || "Sync failed",
      });
    }
  } catch (error) {
    pendingAgentSyncs.delete(requestId);
    const message = error instanceof Error ? error.message : String(error);
    await context.sessionRepository.update(sessionId, {
      syncState: "error",
      lastSyncError: message,
    });

    const status = await context.autoCommitService.getSyncStatus(sessionId);
    return {
      success: false,
      message: "Agent sync failed",
      error: message,
      syncStatus: status,
      statusCode: 500,
    };
  }

  const status = await context.autoCommitService.getSyncStatus(sessionId);

  return {
    success: agentResult.success,
    message: agentResult.message,
    error: agentResult.error,
    noChanges: agentResult.noChanges,
    syncStatus: status,
    statusCode: agentResult.success ? 200 : 500,
  };
}

export function createAutoCommitRouter(
  service: AutoCommitService,
  syncContext?: Omit<AutoCommitRouterContext, "autoCommitService">,
): Hono {
  const router = new Hono();

  const auth = syncContext?.auth
    ? createAuthMiddleware(syncContext.auth)
    : (c, next) => next();

  router.use("/*", auth);

  router.post("/:sessionId/sync", async (c) => {
    const sessionId = c.req.param("sessionId");
    if (!syncContext) {
      return c.json(
        {
          success: false,
          error: "Sync context not configured",
          statusCode: 500,
        },
        500,
      );
    }
    const result = await syncSessionViaAssignedAgent(sessionId, {
      autoCommitService: service,
      ...syncContext,
    });
    return c.json(
      {
        success: result.success,
        message: result.message,
        error: result.error,
        noChanges: result.noChanges,
        syncStatus: result.syncStatus,
      },
      result.statusCode,
    );
  });

  router.get("/:sessionId/sync-status", async (c) => {
    const sessionId = c.req.param("sessionId");
    const status = await service.getSyncStatus(sessionId);
    if (!status) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json(status);
  });

  return router;
}

export default createAutoCommitRouter;
