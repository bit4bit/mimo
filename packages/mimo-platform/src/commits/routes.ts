/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { commitService } from "../commits/service.js";
import { authMiddleware } from "../auth/middleware.js";
import type { Context } from "hono";

const router = new Hono();

// Apply auth middleware to all routes
router.use("/*", authMiddleware);

// GET /commits/:sessionId/preview - Get commit preview with file tree
router.get("/:sessionId/preview", async (c: Context) => {
  const sessionId = c.req.param("sessionId");

  const result = await commitService.getPreview(sessionId);

  if (!result.success) {
    return c.json(
      {
        success: false,
        error: result.error,
      },
      400
    );
  }

  return c.json({
    success: true,
    preview: result.preview,
  });
});

// POST /commits/:sessionId/commit-and-push - Commit and push
router.post("/:sessionId/commit-and-push", async (c: Context) => {
  const sessionId = c.req.param("sessionId");

  let message: string | undefined;
  let selectedPaths: string[] | undefined;
  let applyStatuses: { added: boolean; modified: boolean; deleted: boolean } | undefined;

  try {
    const body = await c.req.json();
    if (typeof body?.message === "string") {
      message = body.message;
    }
    if (Array.isArray(body?.selectedPaths)) {
      selectedPaths = body.selectedPaths;
    }
    if (body?.applyStatuses && typeof body.applyStatuses === "object") {
      applyStatuses = {
        added: body.applyStatuses.added ?? true,
        modified: body.applyStatuses.modified ?? true,
        deleted: body.applyStatuses.deleted ?? true,
      };
    }
  } catch {
    message = undefined;
  }

  const result = await commitService.commitAndPushSelective(
    sessionId,
    message || "",
    selectedPaths,
    applyStatuses
  );

  const status = result.success ? 200 : 400;
  const body: Record<string, unknown> = {
    success: result.success,
    message: result.message,
    error: result.error,
    step: result.step,
  };

  if (result.invalidPaths) {
    body.invalidPaths = result.invalidPaths;
  }

  return c.json(body, status);
});

// POST /commits/:sessionId - Alias for commit-and-push
router.post("/:sessionId", async (c: Context) => {
  const sessionId = c.req.param("sessionId");

  let message: string | undefined;
  let selectedPaths: string[] | undefined;
  let applyStatuses: { added: boolean; modified: boolean; deleted: boolean } | undefined;

  try {
    const body = await c.req.json();
    if (typeof body?.message === "string") {
      message = body.message;
    }
    if (Array.isArray(body?.selectedPaths)) {
      selectedPaths = body.selectedPaths;
    }
    if (body?.applyStatuses && typeof body.applyStatuses === "object") {
      applyStatuses = {
        added: body.applyStatuses.added ?? true,
        modified: body.applyStatuses.modified ?? true,
        deleted: body.applyStatuses.deleted ?? true,
      };
    }
  } catch {
    message = undefined;
  }

  const result = await commitService.commitAndPushSelective(
    sessionId,
    message || "",
    selectedPaths,
    applyStatuses
  );

  const status = result.success ? 200 : 400;
  const body: Record<string, unknown> = {
    success: result.success,
    message: result.message,
    error: result.error,
    step: result.step,
  };

  if (result.invalidPaths) {
    body.invalidPaths = result.invalidPaths;
  }

  return c.json(body, status);
});

export default router;
