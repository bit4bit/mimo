import { Hono } from "hono";
import type { Context } from "hono";
import type { FileService } from "./types.js";
import { findFiles } from "./service.js";
import { detectLanguage, escapeHtml } from "./syntax-highlighter.js";

interface FilesRoutesContext {
  fileService: FileService;
  getWorkspacePath: (sessionId: string) => Promise<string | null>;
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

    return c.json({ path: filePath, name, language, lineCount, content: escapedContent });
  });

  return router;
}
