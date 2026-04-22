import { Hono } from "hono";
import type { Context } from "hono";
import { createFileService } from "../files/service.js";
import { mcpTokenStore } from "./token-store.js";
import { broadcastToSession } from "../ws/session-broadcast.js";
import { logger } from "../logger.js";

interface McpRoutesContext {
  chatSessions: Map<string, Set<{ readyState: number; send: (msg: string) => void }>>;
  fileWatchSessions?: Map<
    string,
    Set<{ readyState: number; send: (msg: string) => void }>
  >;
  getSessionWorkspace(sessionId: string): Promise<string | null>;
}

export function createMcpRoutes(mimoContext: McpRoutesContext) {
  const router = new Hono();
  const fileService = createFileService();

  router.post("/", async (c: Context) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.debug("[mcp] Unauthorized request: missing bearer token");
      return c.json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.slice("Bearer ".length);
    const sessionId = mcpTokenStore.resolve(token);
    if (!sessionId) {
      logger.debug("[mcp] Unauthorized request: unknown token");
      return c.json({ error: "Unauthorized" }, 401);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const hasJsonRpcEnvelope =
      body && (body.jsonrpc === "2.0" || body.id !== undefined);
    const rpcId = body?.id ?? null;
    const respondResult = (result: unknown, status = 200) => {
      if (hasJsonRpcEnvelope) {
        return c.json({ jsonrpc: "2.0", id: rpcId, result }, status);
      }
      return c.json({ result }, status);
    };

    const { method } = body;

    if (method === "notifications/initialized") {
      if (body?.id === undefined) {
        return c.body(null, 204);
      }
      return respondResult({});
    }

    if (method === "initialize") {
      logger.debug("[mcp] Client initialized", { sessionId });
      return respondResult({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mimo", version: "1.0.0" },
      });
    }

    if (method === "tools/list") {
      return respondResult({
        tools: [
          {
            name: "open_file",
            description:
              "Open a file in the platform editor (EditBuffer) for the current session",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description:
                    "Relative path to the file within the session workspace",
                },
              },
              required: ["path"],
            },
          },
        ],
      });
    }

    if (method === "ping") {
      return respondResult({});
    }

    if (method === "tools/call") {
      const params = body?.params ?? body;
      const name = params?.name;
      const args = params?.arguments;
      if (name !== "open_file") {
        return respondResult({ success: false, error: `Unknown tool: ${name}` });
      }

      const filePath = args?.path;
      if (!filePath || typeof filePath !== "string") {
        return respondResult({
          success: false,
          error: "Missing required argument: path",
        });
      }

      const requestedSessionId = args?.sessionId;
      if (
        typeof requestedSessionId === "string" &&
        requestedSessionId.length > 0 &&
        requestedSessionId !== sessionId
      ) {
        logger.debug("[mcp] Unauthorized tools/call: session mismatch", {
          tokenSessionId: sessionId,
          requestedSessionId,
        });
        return c.json({ error: "Unauthorized" }, 401);
      }

      const workspacePath = await mimoContext.getSessionWorkspace(sessionId);
      if (!workspacePath) {
        return respondResult({ success: false, error: "Session not found" });
      }

      try {
        await fileService.readFile(workspacePath, filePath);
      } catch (err: any) {
        if (err?.message?.includes("Access denied")) {
          return respondResult({
            success: false,
            error: "Access denied: path outside workspace",
          });
        }
        return respondResult({ success: false, error: "File not found" });
      }

      broadcastToSession(mimoContext.chatSessions, sessionId, {
        type: "open_file_in_editbuffer",
        sessionId,
        path: filePath,
      });
      const fileWatchSubscribers = mimoContext.fileWatchSessions?.get(sessionId);
      if (fileWatchSubscribers) {
        const payload = JSON.stringify({
          type: "open_file_in_editbuffer",
          sessionId,
          path: filePath,
        });
        fileWatchSubscribers.forEach((client) => {
          if (client.readyState === 1) {
            client.send(payload);
          }
        });
      }
      logger.debug("[mcp] open_file broadcast sent", { sessionId, path: filePath });

      return respondResult({ success: true, path: filePath });
    }

    if (hasJsonRpcEnvelope) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: rpcId,
          error: { code: -32601, message: "Method not found" },
        },
        200,
      );
    }
    return c.json({ error: "Method not found" }, 404);
  });

  return router;
}
