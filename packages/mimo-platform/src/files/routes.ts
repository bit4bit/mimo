// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from "hono";
import type { Context } from "hono";
import type { FileService } from "./types.js";
import { findFiles } from "./service.js";
import { detectLanguage, escapeHtml } from "./syntax-highlighter.js";
import { ExpertService } from "./expert-service.js";

interface FilesRoutesContext {
  fileService: FileService;
  getWorkspacePath: (sessionId: string) => Promise<string | null>;
  expertService: ExpertService;
}

export function createFilesRoutes(ctx: FilesRoutesContext) {
  const router = new Hono();

  // GET /api/sessions/:sessionId/files?pattern=...
  router.get("/", async (c: Context) => {
    const sessionId = c.req.param("sessionId");
    const pattern = c.req.query("pattern") ?? "";

    const workspacePath = await ctx.getWorkspacePath(sessionId);
    if (!workspacePath) {
      return c.json({ error: "Session not found" }, 404);
    }

    const allFiles = await ctx.fileService.listFiles(workspacePath);
    const filtered = findFiles(pattern, allFiles);
    return c.json(filtered);
  });

  // GET /api/sessions/:sessionId/files/content?path=...
  router.get("/content", async (c: Context) => {
    const sessionId = c.req.param("sessionId");
    const filePath = c.req.query("path");

    if (!filePath) {
      return c.json({ error: "path query param required" }, 400);
    }

    const workspacePath = await ctx.getWorkspacePath(sessionId);
    if (!workspacePath) {
      return c.json({ error: "Session not found" }, 404);
    }

    let raw: string;
    try {
      raw = await ctx.fileService.readFile(workspacePath, filePath);
    } catch (err: any) {
      if (err?.message?.includes("Access denied")) {
        return c.json({ error: "Access denied" }, 403);
      }
      return c.json({ error: "File not found" }, 404);
    }

    const language = detectLanguage(filePath);
    const name = filePath.split("/").pop() ?? filePath;
    const lineCount = raw.split("\n").length;
    const escapedContent = escapeHtml(raw);

    return c.json({
      path: filePath,
      name,
      language,
      lineCount,
      content: escapedContent,
    });
  });

  // POST /api/sessions/:sessionId/files/write
  router.post("/write", async (c: Context) => {
    const sessionId = c.req.param("sessionId");
    const { path, content } = await c.req.json<{
      path: string;
      content: string;
    }>();

    if (!path || content === undefined) {
      return c.json({ error: "path and content required" }, 400);
    }

    const workspacePath = await ctx.getWorkspacePath(sessionId);
    if (!workspacePath) {
      return c.json({ error: "Session not found" }, 404);
    }

    try {
      const result = await ctx.expertService.writeFileContent(
        workspacePath,
        path,
        content,
      );
      return c.json(result);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return c.json({ error: err.message }, 404);
      }
      return c.json({ error: err.message }, 400);
    }
  });

  return router;
}
