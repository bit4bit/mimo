// SPDX-License-Identifier: AGPL-3.0-only
import { Hono } from "hono";
import type { Context } from "hono";
import type { FileService } from "../../domain/files/types.js";
import type { SessionRepository } from "../../domain/sessions/repository.js";
import type { AgentService } from "../../domain/agents/service.js";
import { mcpTokenStore } from "../../mcp/token-store.js";
import { broadcastToSession } from "../websocket/session-broadcast.js";
import { toChatThreadResponse } from "../rest/sessions/types.js";
import { autoName } from "../../domain/sessions/auto-name.js";
import { logger } from "../../logger.js";

interface McpRoutesContext {
  chatSessions: Map<
    string,
    Set<{ readyState: number; send: (msg: string) => void }>
  >;
  fileWatchSessions?: Map<
    string,
    Set<{ readyState: number; send: (msg: string) => void }>
  >;
  getSessionWorkspace(sessionId: string): Promise<string | null>;
  fileService: FileService;
  sessionRepository: Pick<SessionRepository, "findById" | "addChatThread">;
  agentService: Pick<AgentService, "sendToAgent" | "listAgentsByOwner">;
}

/**
 * Check a requested model/mode against the target agent's advertised options.
 * Returns an error message if the agent advertises options and the requested
 * value is not among them; otherwise null. If the agent advertises nothing
 * (e.g. never connected), the value cannot be validated and is accepted.
 */
/**
 * Rank available options by how closely they match the requested string:
 * a full case-insensitive substring match scores highest, then any shared
 * token (split on non-alphanumeric). Returns the matching values, best first.
 */
function closeMatches(
  requested: string,
  available: Array<{ value: string; name?: string }>,
): string[] {
  const q = requested.toLowerCase().trim();
  if (!q) return [];
  const tokens = q.split(/[^a-z0-9.]+/).filter(Boolean);
  return available
    .map((o) => {
      const hay = `${o.value} ${o.name ?? ""}`.toLowerCase();
      let score = 0;
      if (hay.includes(q)) score += 10;
      for (const t of tokens) if (hay.includes(t)) score += 3;
      return { value: o.value, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.value);
}

function validateOption(
  kind: "model" | "mode",
  requested: string,
  available: Array<{ value: string; name?: string }> | undefined,
): string | null {
  if (!available || available.length === 0) {
    return null;
  }
  if (available.some((o) => o.value === requested)) {
    return null;
  }
  const suggestions = closeMatches(requested, available);
  const hint =
    suggestions.length > 0
      ? `Did you mean: ${suggestions.slice(0, 5).join(", ")}?`
      : `Valid ${kind}s: ${available.map((o) => o.value).join(", ")}`;
  return `Invalid ${kind} '${requested}' for the selected agent. ${hint}`;
}

export function createMcpRoutes(mimoContext: McpRoutesContext) {
  const router = new Hono();
  const fileService = mimoContext.fileService;
  const sessionRepository = mimoContext.sessionRepository;
  const agentService = mimoContext.agentService;

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
              "Open or show a file to the user in the platform editor (EditBuffer). Use this tool when the user asks to open, view, see, or look at a file, or references a file path they want to examine. Examples: 'open file x.ts', 'show me README.md', 'look at src/main.ts', 'go to line 50 of app.js'. This makes the file visible in the user's editor. Optionally scrolls to a specific line.",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description:
                    "Relative path to the file within the session workspace. Call this whenever the user mentions a file they want to open or view.",
                },
                line: {
                  type: "integer",
                  minimum: 1,
                  description:
                    "Optional 1-based line to center in the editor view after opening",
                },
              },
              required: ["path"],
            },
          },
          {
            name: "create_chat_thread",
            description:
              "Start a new sibling chat thread in the current session that works in parallel, seeded with an initial prompt. Use this to kick off a separate line of work (e.g. 'spin up a thread to refactor auth while we keep reviewing here'). The new thread inherits this thread's model, mode, and agent unless you override them. The thread name is generated automatically; do not supply one unless the user gives an explicit short title. The initialPrompt is delivered to the new thread as the user's first message and the thread begins acting on it immediately. IMPORTANT: model, mode, and assignedAgentId must be EXACT values for the chosen agent. The user will often give an approximate name (e.g. 'glm', 'opencode'); call list_thread_options to get the exact agent id and that agent's exact model/mode values, then match the user's request to one of them. If more than one option matches the user's request, ask the user which one to use before creating the thread. If the tool returns an Invalid model/mode/agent error, read the valid values in the error, pick the right one, and retry.",
            inputSchema: {
              type: "object",
              properties: {
                initialPrompt: {
                  type: "string",
                  description:
                    "The first user message for the new thread. The new thread's LLM acts on this immediately.",
                },
                title: {
                  type: "string",
                  description:
                    "Optional short title for the new thread's tab. Keep it brief — it is trimmed to a few words / ~24 characters. If omitted, a short title is derived from the initialPrompt.",
                },
                model: {
                  type: "string",
                  description:
                    "Optional model override. Defaults to the calling thread's model. See list_thread_options for valid values.",
                },
                mode: {
                  type: "string",
                  description:
                    "Optional mode override. Defaults to the calling thread's mode. See list_thread_options for valid values.",
                },
                assignedAgentId: {
                  type: "string",
                  description:
                    "Optional agent override. Defaults to the calling thread's agent. See list_thread_options for valid values.",
                },
              },
              required: ["initialPrompt"],
            },
          },
          {
            name: "list_thread_options",
            description:
              "List the agents, models, and modes available as overrides for create_chat_thread. Each agent includes its own valid models and modes, so pick a model/mode that the chosen agent actually supports. Call this when you want to spawn a thread with a specific agent, model, or mode rather than inheriting the current thread's settings.",
            inputSchema: {
              type: "object",
              properties: {},
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

      if (name === "create_chat_thread") {
        const callerThreadId = c.req.header("X-Mimo-Thread-Id");

        // Every failure returns an error result AND pushes a
        // `chat_thread_create_failed` event to the session UI, so a rejected
        // spawn is never silent — the user sees why even if the spawning LLM
        // does not relay it.
        const fail = (error: string) => {
          logger.debug("[mcp] create_chat_thread failed", {
            sessionId,
            callerThreadId,
            error,
          });
          broadcastToSession(mimoContext.chatSessions, sessionId, {
            type: "chat_thread_create_failed",
            sessionId,
            callerThreadId: callerThreadId ?? null,
            error,
          });
          return respondResult({ success: false, error });
        };

        try {
          if (!callerThreadId) {
            return fail("Missing X-Mimo-Thread-Id header");
          }

          const initialPrompt = args?.initialPrompt;
          if (
            !initialPrompt ||
            typeof initialPrompt !== "string" ||
            initialPrompt.trim().length === 0
          ) {
            return fail("Missing required argument: initialPrompt");
          }

          const session = await sessionRepository.findById(sessionId);
          if (!session) {
            return fail("Session not found");
          }

          const callerThread = session.chatThreads.find(
            (t) => t.id === callerThreadId,
          );
          if (!callerThread) {
            return fail("Calling thread not found in session");
          }

          // Resolve the agent. An explicit override may be given by id or by
          // name (the LLM often supplies a name). An unresolved explicit agent
          // is an error so validation can never be silently skipped.
          const agents = await agentService.listAgentsByOwner(session.owner);
          const requestedAgentRef =
            typeof args?.assignedAgentId === "string" && args.assignedAgentId
              ? args.assignedAgentId
              : null;

          let targetAgent;
          let assignedAgentId: string | null;
          if (requestedAgentRef) {
            targetAgent = agents.find(
              (a) => a.id === requestedAgentRef || a.name === requestedAgentRef,
            );
            if (!targetAgent) {
              const valid =
                agents.map((a) => `${a.name} (${a.id})`).join(", ") || "none";
              return fail(
                `Invalid agent '${requestedAgentRef}'. Valid agents: ${valid}`,
              );
            }
            assignedAgentId = targetAgent.id;
          } else {
            assignedAgentId = callerThread.assignedAgentId;
            targetAgent = assignedAgentId
              ? agents.find((a) => a.id === assignedAgentId)
              : undefined;
          }

          const requestedModel =
            typeof args?.model === "string" && args.model
              ? args.model
              : callerThread.model;
          const requestedMode =
            typeof args?.mode === "string" && args.mode
              ? args.mode
              : callerThread.mode;

          // Validate the model/mode against the target agent's advertised
          // capabilities; reject with an error (listing the valid values) when
          // invalid so the spawned thread never starts with a model the agent
          // cannot use, and so the caller can search the list for the right
          // value.
          const modelError = validateOption(
            "model",
            requestedModel,
            targetAgent?.capabilities?.availableModels,
          );
          if (modelError) {
            return fail(modelError);
          }
          const modeError = validateOption(
            "mode",
            requestedMode,
            targetAgent?.capabilities?.availableModes,
          );
          if (modeError) {
            return fail(modeError);
          }
          const model = requestedModel;
          const mode = requestedMode;

          // Prefer an explicit title; otherwise derive from the prompt. Either
          // way the same short, char-limited, deduped naming is applied.
          const nameSource =
            typeof args?.title === "string" && args.title.trim().length > 0
              ? args.title
              : initialPrompt;
          const threadName = autoName(
            nameSource,
            session.chatThreads.map((t) => t.name),
          );

          let thread;
          try {
            thread = await sessionRepository.addChatThread(sessionId, {
              name: threadName,
              model,
              mode,
              acpSessionId: null,
              assignedAgentId,
              state: "active",
              brainWash: false,
            });
          } catch (err) {
            return fail(
              err instanceof Error ? err.message : "Failed to create thread",
            );
          }

          const agentId = thread.assignedAgentId ?? session.assignedAgentId;
          if (agentId) {
            await agentService.sendToAgent(agentId, {
              type: "initial_prompt",
              sessionId,
              chatThreadId: thread.id,
              content: initialPrompt,
            });
          }

          // Surface the new thread live in any open session UI (no in-page
          // caller exists on the MCP path, so push it rather than relying on a
          // refetch).
          broadcastToSession(mimoContext.chatSessions, sessionId, {
            type: "chat_thread_created",
            sessionId,
            thread: toChatThreadResponse(thread),
          });

          logger.debug("[mcp] create_chat_thread", {
            sessionId,
            callerThreadId,
            threadId: thread.id,
            name: thread.name,
          });

          return respondResult({
            success: true,
            threadId: thread.id,
            name: thread.name,
            model: thread.model,
            mode: thread.mode,
          });
        } catch (err) {
          return fail(
            err instanceof Error
              ? err.message
              : "Unexpected error creating chat thread",
          );
        }
      }

      if (name === "list_thread_options") {
        const session = await sessionRepository.findById(sessionId);
        if (!session) {
          return respondResult({ success: false, error: "Session not found" });
        }

        // Each agent advertises its own valid models/modes via capabilities, so
        // the caller can pick a model that is valid for the chosen agent.
        const agents = (
          await agentService.listAgentsByOwner(session.owner)
        ).map((a) => ({
          id: a.id,
          name: a.name,
          models: a.capabilities?.availableModels ?? [],
          modes: a.capabilities?.availableModes ?? [],
          defaultModelId: a.capabilities?.defaultModelId ?? null,
          defaultModeId: a.capabilities?.defaultModeId ?? null,
        }));
        // Current session defaults (the inherited values when no override given).
        const models = session.modelState?.availableModels ?? [];
        const modes = session.modeState?.availableModes ?? [];

        return respondResult({ success: true, agents, models, modes });
      }

      if (name !== "open_file") {
        return respondResult({
          success: false,
          error: `Unknown tool: ${name}`,
        });
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

      const rawLine = args?.line;
      const validLine =
        Number.isInteger(rawLine) && (rawLine as number) >= 1
          ? (rawLine as number)
          : undefined;

      const broadcastPayload: {
        type: string;
        sessionId: string;
        path: string;
        line?: number;
      } = {
        type: "open_file_in_editbuffer",
        sessionId,
        path: filePath,
      };
      if (validLine !== undefined) {
        broadcastPayload.line = validLine;
      }

      broadcastToSession(mimoContext.chatSessions, sessionId, broadcastPayload);
      const fileWatchSubscribers =
        mimoContext.fileWatchSessions?.get(sessionId);
      if (fileWatchSubscribers) {
        const payload = JSON.stringify(broadcastPayload);
        fileWatchSubscribers.forEach((client) => {
          if (client.readyState === 1) {
            client.send(payload);
          }
        });
      }
      logger.debug("[mcp] open_file broadcast sent", {
        sessionId,
        path: filePath,
        line: validLine,
      });

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
