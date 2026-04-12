/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { authMiddleware } from "../auth/middleware.js";
import { autoCommitService } from "./service.js";

export function createAutoCommitRouter(service = autoCommitService): Hono {
  const router = new Hono();

  router.use("/*", authMiddleware);

  router.post("/:sessionId/sync", async (c) => {
    const sessionId = c.req.param("sessionId");
    const result = await service.syncNow(sessionId);
    const status = await service.getSyncStatus(sessionId);

    return c.json(
      {
        success: result.success,
        message: result.message,
        error: result.error,
        syncStatus: status,
      },
      result.success ? 200 : 500
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
