/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { join } from "path";
import { authMiddleware } from "../auth/middleware.js";
import { autoCommitService } from "./service.js";
import { sessionRepository } from "../sessions/repository.js";
import { agentService } from "../agents/service.js";
import { vcs } from "../vcs/index.js";
import { sccService } from "../impact/scc-service.js";

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
    message: result.message || (result.success ? "Sync completed" : "Sync failed"),
    error: result.error,
    noChanges: result.noChanges,
  });
  return true;
}

export function createAutoCommitRouter(service = autoCommitService): Hono {
  const router = new Hono();

  router.use("/*", authMiddleware);

  router.post("/:sessionId/sync", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await sessionRepository.findById(sessionId);

    if (!session) {
      return c.json({ success: false, message: "Session not found", error: "Session not found" }, 404);
    }

    if (!session.assignedAgentId) {
      return c.json(
        {
          success: false,
          message: "No agent assigned to this session",
          error: "No agent assigned to this session",
        },
        400
      );
    }

    const agentWs = agentService.getAgentConnection(session.assignedAgentId);
    if (!agentWs || agentWs.readyState !== 1) {
      return c.json(
        {
          success: false,
          message: "Assigned agent is offline",
          error: "Assigned agent is offline",
        },
        503
      );
    }

    await sessionRepository.update(sessionId, {
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
        })
      );

      agentResult = await agentResultPromise;

      if (agentResult.success) {
        if (!agentResult.noChanges) {
          const fossilPath = sessionRepository.getFossilPath(sessionId);
          const checkoutMarkerPath = join(session.agentWorkspacePath, ".fslckout");

          if (!existsSync(checkoutMarkerPath)) {
            const openResult = await vcs.openFossil(fossilPath, session.agentWorkspacePath);
            if (!openResult.success) {
              throw new Error(openResult.error || "Failed to open local fossil checkout");
            }
          }

          const upResult = await vcs.fossilUp(session.agentWorkspacePath);
          if (!upResult.success) {
            throw new Error(upResult.error || "Failed to refresh local agent workspace from fossil");
          }

          sccService.invalidateCache(session.agentWorkspacePath);
        }

        await sessionRepository.update(sessionId, {
          syncState: "idle",
          lastSyncAt: new Date().toISOString(),
          lastSyncError: undefined,
        });
      } else {
        await sessionRepository.update(sessionId, {
          syncState: "error",
          lastSyncError: agentResult.error || agentResult.message || "Sync failed",
        });
      }
    } catch (error) {
      pendingAgentSyncs.delete(requestId);
      const message = error instanceof Error ? error.message : String(error);
      await sessionRepository.update(sessionId, {
        syncState: "error",
        lastSyncError: message,
      });

      const status = await service.getSyncStatus(sessionId);
      return c.json(
        {
          success: false,
          message: "Agent sync failed",
          error: message,
          syncStatus: status,
        },
        500
      );
    }

    const status = await service.getSyncStatus(sessionId);

    return c.json(
      {
        success: agentResult.success,
        message: agentResult.message,
        error: agentResult.error,
        noChanges: agentResult.noChanges,
        syncStatus: status,
      },
      agentResult.success ? 200 : 500
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

const router = createAutoCommitRouter();

export default router;
