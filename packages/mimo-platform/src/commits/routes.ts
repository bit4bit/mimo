/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { commitService } from "../commits/service.js";
import { authMiddleware } from "../auth/middleware.js";
import type { Context } from "hono";

const router = new Hono();

// Apply auth middleware to all routes
router.use("/*", authMiddleware);

// POST /commits/:sessionId - Commit changes
router.post("/:sessionId", async (c: Context) => {
  const sessionId = c.req.param("sessionId");
  const { message } = await c.req.json() as { message: string };
  
  if (!message || message.trim().length === 0) {
    return c.json({
      success: false,
      error: "Commit message is required",
    }, 400);
  }
  
  const result = await commitService.commit(sessionId, message);
  return c.json(result);
});

// POST /commits/:sessionId/push - Push changes
router.post("/:sessionId/push", async (c: Context) => {
  const sessionId = c.req.param("sessionId");
  
  const result = await commitService.push(sessionId);
  return c.json(result);
});

// POST /commits/:sessionId/commit-and-push - Commit and push
router.post("/:sessionId/commit-and-push", async (c: Context) => {
  const sessionId = c.req.param("sessionId");
  const { message } = await c.req.json() as { message: string };
  
  if (!message || message.trim().length === 0) {
    return c.json({
      success: false,
      error: "Commit message is required",
    }, 400);
  }
  
  const result = await commitService.commitAndPush(sessionId, message);
  return c.json(result);
});

// GET /commits/:sessionId/status - Get repository status
router.get("/:sessionId/status", async (c: Context) => {
  const sessionId = c.req.param("sessionId");
  
  const result = await commitService.getStatus(sessionId);
  return c.json(result);
});

// GET /commits/:sessionId/history - Get commit history
router.get("/:sessionId/history", async (c: Context) => {
  const sessionId = c.req.param("sessionId");
  const limit = parseInt(c.req.query("limit") || "10");
  
  const result = await commitService.getCommitHistory(sessionId, limit);
  return c.json(result);
});

export default router;
