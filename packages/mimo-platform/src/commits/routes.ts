/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { commitService } from "../commits/service.js";
import { authMiddleware } from "../auth/middleware.js";
import type { Context } from "hono";

const router = new Hono();

// Apply auth middleware to all routes
router.use("/*", authMiddleware);

// POST /commits/:sessionId/commit-and-push - Commit and push
router.post("/:sessionId/commit-and-push", async (c: Context) => {
  const sessionId = c.req.param("sessionId");

  let message: string | undefined;
  try {
    const body = await c.req.json();
    if (typeof body?.message === "string") {
      message = body.message;
    }
  } catch {
    message = undefined;
  }

  const result = await commitService.commitAndPush(sessionId, message);
  return c.json({
    success: result.success,
    message: result.message,
    error: result.error,
    step: result.step,
  });
});

// POST /commits/:sessionId - Alias for commit-and-push
router.post("/:sessionId", async (c: Context) => {
  const sessionId = c.req.param("sessionId");

  let message: string | undefined;
  try {
    const body = await c.req.json();
    if (typeof body?.message === "string") {
      message = body.message;
    }
  } catch {
    message = undefined;
  }

  const result = await commitService.commitAndPush(sessionId, message);
  return c.json({
    success: result.success,
    message: result.message,
    error: result.error,
    step: result.step,
  });
});

export default router;
