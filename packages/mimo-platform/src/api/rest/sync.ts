// SPDX-License-Identifier: AGPL-3.0-only
/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { createAuthMiddleware } from "../../auth/middleware.js";
import type { Context } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";

export function createSyncRoutes(mimoContext: MimoContext): Hono {
  const service = mimoContext.services.fileSync;
  const auth = createAuthMiddleware(mimoContext.services.auth);

  const router = new Hono();

  // Apply auth middleware to all routes
  router.use("/*", auth);

  // GET /sync/:sessionId - Get change set for a session
  router.get("/:sessionId", async (c: Context) => {
    const sessionId = c.req.param("sessionId");

    const changeSet = await service.getChangeSet(sessionId);
    return c.json(changeSet);
  });

  // POST /sync/:sessionId/files - Report file changes (from agent)
  router.post("/:sessionId/files", async (c: Context) => {
    const sessionId = c.req.param("sessionId");
    const changes = (await c.req.json()) as Array<{
      path: string;
      isNew?: boolean;
      deleted?: boolean;
    }>;

    const fileChanges = await service.handleFileChanges(sessionId, changes);
    return c.json(fileChanges);
  });

  // GET /sync/:sessionId/file/:path/status - Get status of a specific file
  router.get("/:sessionId/file/:path/status", async (c: Context) => {
    const sessionId = c.req.param("sessionId");
    const filePath = c.req.param("path");

    const status = await service.getFileStatus(sessionId, filePath);
    return c.json({ path: filePath, status });
  });

  // POST /sync/:sessionId/init - Initialize session sync
  router.post("/:sessionId/init", async (c: Context) => {
    const sessionId = c.req.param("sessionId");
    const body = (await c.req.json()) as {
      sessionWorktreePath: string;
      originalRepoPath?: string;
    };

    try {
      await service.initializeSession(
        sessionId,
        body.sessionWorktreePath,
        body.originalRepoPath,
      );
      await service.scanSessionCheckout(sessionId);
      return c.json({ success: true });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: (error as Error).message,
        },
        500,
      );
    }
  });

  return router;
}
