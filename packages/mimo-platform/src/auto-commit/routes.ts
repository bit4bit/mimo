/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { join } from "path";
import { authMiddleware } from "../auth/middleware.js";
import type { AutoCommitService } from "./service.js";
import { vcs } from "../vcs/index.js";

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
    getFossilPath: (sessionId: string) => string;
  };
  agentService: {
    getAgentConnection: (agentId: string) => any;
  };
  sccService: {
    invalidateCache: (path: string) => void;
  };
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
        const fossilPath = context.sessionRepository.getFossilPath(sessionId);
        const checkoutMarkerPath = join(
          session.agentWorkspacePath,
          ".fslckout",
        );

        if (!existsSync(checkoutMarkerPath)) {
          const openResult = await vcs.openFossil(
            fossilPath,
            session.agentWorkspacePath,
          );
          if (!openResult.success) {
            throw new Error(
              openResult.error || "Failed to open local fossil checkout",
            );
          }
        }

        const upResult = await vcs.fossilUp(session.agentWorkspacePath);
        if (!upResult.success) {
          throw new Error(
            upResult.error ||
              "Failed to refresh local agent workspace from fossil",
          );
        }

        context.sccService.invalidateCache(session.agentWorkspacePath);
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

  router.use("/*", authMiddleware);

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
