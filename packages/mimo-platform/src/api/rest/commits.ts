// SPDX-License-Identifier: AGPL-3.0-only
/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { createAuthMiddleware } from "../../auth/middleware.js";
import type { Context } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";

export function createCommitRoutes(mimoContext: MimoContext): Hono {
  const service = mimoContext.services.commits;
  const auth = createAuthMiddleware(mimoContext.services.auth);

  const router = new Hono();

  // Apply auth middleware to all routes
  router.use("/*", auth);

  // GET /commits/:sessionId/preview - Get commit preview with file tree
  router.get("/:sessionId/preview", async (c: Context) => {
    const sessionId = c.req.param("sessionId");

    const result = await service.getPreview(sessionId);

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
        },
        400,
      );
    }

    return c.json({
      success: true,
      preview: result.preview,
    });
  });

  // GET /commits/:sessionId/files/:filePath/hunks - Get diff hunks for one file
  router.get("/:sessionId/files/:filePath/hunks", async (c: Context) => {
    const sessionId = c.req.param("sessionId");
    const filePath = c.req.param("filePath");
    const repoId = c.req.query("repoId");

    const result = await service.getFileHunks(sessionId, filePath, repoId);

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
        },
        result.error === "File not found in preview" ? 404 : 400,
      );
    }

    return c.json({
      success: true,
      hunks: result.hunks,
      isBinary: result.isBinary,
    });
  });

  // POST /commits/:sessionId/commit-and-push - Commit and push
  router.post("/:sessionId/commit-and-push", async (c: Context) => {
    const sessionId = c.req.param("sessionId");

    let message: string | undefined;
    let selectedPaths:
      | Array<string | { repoId: string; path: string }>
      | undefined;
    let applyStatuses:
      | { added: boolean; modified: boolean; deleted: boolean }
      | undefined;

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

    const result = await service.commitAndPushAcrossRepos(
      sessionId,
      message || "",
      selectedPaths,
      applyStatuses,
    );

    const status = result.success ? 200 : 400;
    const body: Record<string, unknown> = {
      success: result.success,
      message: result.message,
      results: result.results,
    };

    return c.json(body, status);
  });

  // POST /commits/:sessionId - Alias for commit-and-push
  router.post("/:sessionId", async (c: Context) => {
    const sessionId = c.req.param("sessionId");

    let message: string | undefined;
    let selectedPaths:
      | Array<string | { repoId: string; path: string }>
      | undefined;
    let applyStatuses:
      | { added: boolean; modified: boolean; deleted: boolean }
      | undefined;

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

    const result = await service.commitAndPushAcrossRepos(
      sessionId,
      message || "",
      selectedPaths,
      applyStatuses,
    );

    const status = result.success ? 200 : 400;
    const body: Record<string, unknown> = {
      success: result.success,
      message: result.message,
      results: result.results,
    };

    return c.json(body, status);
  });

  // POST /commits/:sessionId/pull-force - Hard-reset repo(s) to remote HEAD
  router.post("/:sessionId/pull-force", async (c: Context) => {
    const sessionId = c.req.param("sessionId");
    const requestBody = await c.req.json().catch(() => ({}));
    const repoId = c.req.query("repoId") ?? requestBody?.repoId;

    const result = await service.pullForceAcrossRepos(sessionId, repoId);

    const status = result.success ? 200 : 400;
    const responseBody: Record<string, unknown> = {
      success: result.success,
      message: result.message,
      results: result.results,
    };

    return c.json(responseBody, status);
  });

  // POST /commits/:sessionId/push-force - Force push to remote
  router.post("/:sessionId/push-force", async (c: Context) => {
    const sessionId = c.req.param("sessionId");
    const requestBody = await c.req.json().catch(() => ({}));
    const repoId = c.req.query("repoId") ?? requestBody?.repoId;

    const result = await service.forcePushAcrossRepos(sessionId, repoId);

    const status = result.success ? 200 : 400;
    const responseBody: Record<string, unknown> = {
      success: result.success,
      message: result.message,
      results: result.results,
    };

    return c.json(responseBody, status);
  });

  return router;
}
