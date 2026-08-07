// SPDX-License-Identifier: AGPL-3.0-only
import { Hono } from "hono";
import type { Context } from "hono";
import type { VCS } from "../../domain/vcs/index.js";

interface ReviewRoutesContext {
  vcs: Pick<VCS, "resolveRootCommit" | "diffNameStatus" | "diffFileRange">;
  getWorkspacePath: (sessionId: string) => Promise<string | null>;
}

export function createReviewRoutes(ctx: ReviewRoutesContext) {
  const router = new Hono();

  // GET /api/sessions/:sessionId/review
  // Returns the changed-file list (added/modified/deleted) for the git
  // commit-range diff between the session's root seed commit and the
  // agent-workspace HEAD. The root commit is resolved on demand via
  // `git rev-list --max-parents=0 HEAD` — independent of `session.baseline`.
  router.get("/", async (c: Context) => {
    const sessionId = c.req.param("sessionId") ?? "";
    const workspacePath = await ctx.getWorkspacePath(sessionId);
    if (!workspacePath) {
      return c.json({ error: "Session not found" }, 404);
    }

    const rootCommit = await ctx.vcs.resolveRootCommit(workspacePath);
    if (!rootCommit) {
      return c.json({
        files: [],
        summary: { added: 0, modified: 0, deleted: 0 },
      });
    }

    const result = await ctx.vcs.diffNameStatus(workspacePath, rootCommit);
    return c.json({
      files: result.files.map((f) => ({ path: f.path, status: f.status })),
      summary: result.summary,
    });
  });

  // GET /api/sessions/:sessionId/review/files/*path
  // Returns the per-file diff hunks for the given path (may contain slashes).
  // The path is captured as the suffix after `/review/files/`.
  router.get("/files/*", async (c: Context) => {
    const sessionId = c.req.param("sessionId") ?? "";
    const workspacePath = await ctx.getWorkspacePath(sessionId);
    if (!workspacePath) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Extract the file path from the URL suffix after `/review/files/`.
    const prefix = `/sessions/${sessionId}/review/files/`;
    const filePath = c.req.path.startsWith(prefix)
      ? decodeURIComponent(c.req.path.slice(prefix.length))
      : "";
    if (!filePath) {
      return c.json({ error: "path required" }, 400);
    }

    const rootCommit = await ctx.vcs.resolveRootCommit(workspacePath);
    if (!rootCommit) {
      return c.json({ error: "File not found in review diff" }, 404);
    }

    const result = await ctx.vcs.diffFileRange(
      workspacePath,
      rootCommit,
      filePath,
    );

    // An empty hunk set means the file is not in the root..HEAD diff.
    if (!result.isBinary && result.hunks.length === 0) {
      return c.json({ error: "File not found in review diff" }, 404);
    }

    return c.json({ hunks: result.hunks, isBinary: result.isBinary });
  });

  return router;
}
