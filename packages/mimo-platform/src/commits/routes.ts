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
// The commit message is automatically generated: "Mimo commit at <timestamp>"
router.post("/:sessionId/commit-and-push", async (c: Context) => {
  const sessionId = c.req.param("sessionId");
  
  // Note: Message parameter is accepted for backwards compatibility but ignored
  // The commit message is automatically generated with timestamp
  const result = await commitService.commitAndPush(sessionId);
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
  
  const result = await commitService.commitAndPush(sessionId);
  return c.json({
    success: result.success,
    message: result.message,
    error: result.error,
    step: result.step,
  });
});

export default router;
