// SPDX-License-Identifier: AGPL-3.0-only
import { join } from "path";
import { logger } from "../../logger.js";
import { handleRefreshImpact } from "../../domain/impact/refresh-handler.js";
import {
  broadcastToSession,
  type SessionWsClient,
} from "./session-broadcast.js";
import type { ChatStreamingPipeline } from "../../domain/sessions/streaming-pipeline.js";
import type { AgentMessageRouter } from "../../domain/agents/message-router.js";
import type { SessionRepository } from "../../domain/sessions/repository.js";
import type { AgentService } from "../../domain/agents/service.js";
import type { ChatService } from "../../domain/sessions/chat.js";
import type { FileWatcherService } from "../../domain/files/file-watcher-service.js";
import type { ImpactCalculator } from "../../domain/impact/calculator.js";
import type { SccService } from "../../domain/impact/scc-service.js";
import type { JwtService } from "../../domain/auth/jwt.js";
import type { FileService } from "../../domain/files/types.js";
import { resolveAtMentions } from "../../domain/chat/resolve-at-mentions.js";

export interface WebSocketHandlerDeps {
  sessionRepository: SessionRepository;
  agentService: AgentService;
  agentRouter: AgentMessageRouter;
  pipeline: ChatStreamingPipeline;
  chatSessions: Map<string, Set<SessionWsClient>>;
  fileWatchSessions: Map<string, Set<any>>;
  calculatingSessions: Set<string>;
  sccService: SccService;
  impactCalculator: ImpactCalculator;
  chatService: ChatService;
  fileWatcher: FileWatcherService;
  fileService: FileService;
}

export function createWebSocketHandlers(deps: WebSocketHandlerDeps) {
  const {
    sessionRepository,
    agentService,
    agentRouter,
    pipeline,
    chatSessions,
    fileWatchSessions,
    calculatingSessions,
    sccService,
    impactCalculator,
    chatService,
    fileWatcher,
    fileService,
  } = deps;

  function generateToolCallsHtml(toolCallsMap: Map<string, any>): string {
    const iconMap: Record<string, string> = {
      read: "📁",
      file: "📁",
      edit: "📝",
      write: "📝",
      bash: "⚡",
      shell: "⚡",
      cmd: "⚡",
      search: "🔍",
      grep: "🔍",
      glob: "🔎",
      find: "🔎",
    };

    const statusIconMap: Record<string, string> = {
      pending: "⏳",
      in_progress: "🔄",
      completed: "✓",
      failed: "✗",
    };

    function getInputPreview(input: unknown): string {
      if (!input) return "";
      try {
        const parsed = typeof input === "string" ? JSON.parse(input) : input;
        if (parsed && typeof parsed === "object") {
          if (parsed.path) return String(parsed.path);
          if (parsed.command) return String(parsed.command);
          if (parsed.query) return String(parsed.query);
          if (parsed.filePath) return String(parsed.filePath);
          if (parsed.pattern) return String(parsed.pattern);
        }
        if (typeof parsed === "string") return parsed.slice(0, 60);
      } catch {
        if (typeof input === "string") return input.slice(0, 60);
      }
      return "";
    }

    const toolRows: string[] = [];
    for (const [, toolCall] of toolCallsMap) {
      const icon = iconMap[toolCall.toolKind] || "🔧";
      const statusIcon = statusIconMap[toolCall.toolStatus] || "⏳";
      const inputPreview = getInputPreview(toolCall.toolInput);
      const titleHtml = inputPreview
        ? `${toolCall.toolTitle} ${inputPreview}`
        : toolCall.toolTitle;
      toolRows.push(`<tool>${icon} ${titleHtml} ${statusIcon}</tool>`);
    }

    return toolRows.join("\n");
  }

  async function broadcastImpactStale(sessionId: string): Promise<void> {
    try {
      const session = await sessionRepository.findById(sessionId);
      if (!session) {
        return;
      }

      broadcastToSession(chatSessions, sessionId, {
        type: "impact_stale",
        sessionId,
        stale: sccService.isStale(session.agentWorkspacePath),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("[impact] Failed to broadcast stale status:", error);
    }
  }

  async function handleAgentMessage(ws: any, data: any) {
    return agentRouter.handle(ws.data?.agentId ?? "unknown", ws, data);
  }

  function resolveAgentId(
    session: any,
    threadId: string | null | undefined,
  ): string | null {
    if (threadId) {
      const thread = session?.chatThreads?.find((t: any) => t.id === threadId);
      if (thread?.assignedAgentId) return thread.assignedAgentId;
    }
    return session?.assignedAgentId ?? null;
  }

  async function handleChatMessage(ws: any, data: any) {
    const sessionId = ws.data.sessionId;

    switch (data.type) {
      case "send_message":
        if (typeof data.promptId !== "string" || data.promptId.length === 0) {
          logger.warn(
            `[stream-protocol] dropped send_message missing promptId session=${sessionId} thread=${data.chatThreadId || "unknown"}`,
          );
          ws.send(
            JSON.stringify({
              type: "error",
              error: "promptId is required",
            }),
          );
          break;
        }
        const userSession = await sessionRepository.findById(sessionId);
        const userThreadId =
          data.chatThreadId || userSession?.activeChatThreadId;

        if (!userThreadId) {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Create a chat thread before sending messages",
            }),
          );
          break;
        }

        await chatService.saveMessage(
          sessionId,
          {
            role: "user",
            content: data.content,
            timestamp: new Date().toISOString(),
          },
          userThreadId,
        );
        await sessionRepository.touchSessionActivity(sessionId);

        const subscribers = chatSessions.get(sessionId);
        if (subscribers) {
          subscribers.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: "message",
                  role: "user",
                  chatThreadId: userThreadId,
                  content: data.content,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }

        const sendAgentId = resolveAgentId(userSession, userThreadId);
        if (sendAgentId) {
          const agentWs = agentService.getAgentConnection(sendAgentId);
          if (agentWs && agentWs.readyState === 1) {
            // Resolve @file mentions to inject file contents
            let agentContent = data.content;
            if (userSession?.agentWorkspacePath) {
              try {
                agentContent = await resolveAtMentions(
                  data.content,
                  userSession.agentWorkspacePath,
                  fileService,
                );
              } catch (err) {
                logger.error("[at-mention] Failed to resolve @mentions:", err);
              }
            }
            agentWs.send(
              JSON.stringify({
                type: "user_message",
                sessionId: sessionId,
                chatThreadId: userThreadId,
                content: agentContent,
                promptId: data.promptId,
              }),
            );
          }
        }
        break;

      case "expert_instruction":
        {
          const originalPath = data.originalPath;
          const expertThreadId = data.chatThreadId;

          if (!originalPath || !expertThreadId) {
            ws.send(
              JSON.stringify({
                type: "error",
                error: "originalPath and chatThreadId are required",
              }),
            );
            break;
          }

          pipeline.setExpertPending(sessionId, expertThreadId, {
            chatThreadId: expertThreadId,
            originalPath,
          });
        }
        break;

      case "set_model":
        const modelSession = await sessionRepository.findById(sessionId);
        const modelThreadId =
          data.chatThreadId || modelSession?.activeChatThreadId;
        const modelAgentId = resolveAgentId(modelSession, modelThreadId);
        if (modelAgentId) {
          const agentWs = agentService.getAgentConnection(modelAgentId);
          if (agentWs && agentWs.readyState === 1) {
            agentWs.send(
              JSON.stringify({
                type: "set_model",
                sessionId: sessionId,
                chatThreadId: modelThreadId,
                modelId: data.modelId,
              }),
            );
          }
        }
        break;

      case "set_mode":
        const modeSession = await sessionRepository.findById(sessionId);
        const modeThreadId =
          data.chatThreadId || modeSession?.activeChatThreadId;
        const modeAgentId = resolveAgentId(modeSession, modeThreadId);
        if (modeAgentId) {
          const modeAgentWs = agentService.getAgentConnection(modeAgentId);
          if (modeAgentWs && modeAgentWs.readyState === 1) {
            modeAgentWs.send(
              JSON.stringify({
                type: "set_mode",
                sessionId: sessionId,
                chatThreadId: modeThreadId,
                modeId: data.modeId,
              }),
            );
          }
        }
        break;

      case "set_brainwash":
        const brainwashSession = await sessionRepository.findById(sessionId);
        const brainwashThreadId =
          data.chatThreadId || brainwashSession?.activeChatThreadId;
        const brainwashAgentId = resolveAgentId(
          brainwashSession,
          brainwashThreadId,
        );
        if (brainwashAgentId) {
          const brainwashAgentWs =
            agentService.getAgentConnection(brainwashAgentId);
          if (brainwashAgentWs && brainwashAgentWs.readyState === 1) {
            brainwashAgentWs.send(
              JSON.stringify({
                type: "set_brainwash",
                sessionId: sessionId,
                chatThreadId: brainwashThreadId,
                brainWash: data.brainWash ?? false,
              }),
            );
          }
        }
        break;

      case "request_state":
        const stateSession = await sessionRepository.findById(sessionId);
        const stateThreadId =
          data.chatThreadId || stateSession?.activeChatThreadId;
        const stateAgentId = resolveAgentId(stateSession, stateThreadId);
        if (stateAgentId) {
          const stateAgentWs = agentService.getAgentConnection(stateAgentId);
          if (stateAgentWs && stateAgentWs.readyState === 1 && stateSession) {
            const stateThread = stateThreadId
              ? stateSession.chatThreads.find(
                  (t: any) => t.id === stateThreadId,
                )
              : undefined;

            stateAgentWs.send(
              JSON.stringify({
                type: "request_state",
                sessionId: sessionId,
                chatThreadId: stateThreadId,
                ...(stateThread?.model && { model: stateThread.model }),
                ...(stateThread?.mode && { mode: stateThread.mode }),
                ...(stateThread?.acpSessionId && {
                  acpSessionId: stateThread.acpSessionId,
                }),
                brainWash: stateThread?.brainWash ?? false,
              }),
            );
          }
        }

        const stateSnap = pipeline.getStreamingSnapshot(
          sessionId,
          stateThreadId,
        );
        const statePromptInFlight = pipeline.isPromptInFlight(
          sessionId,
          stateThreadId,
        );
        const stateSessionPromptInFlight = pipeline.isPromptInFlight(sessionId);
        if (
          (stateSnap.thoughtContent ||
            stateSnap.messageContent ||
            statePromptInFlight ||
            stateSessionPromptInFlight) &&
          chatService.isAgentAlive(sessionId)
        ) {
          ws.send(
            JSON.stringify({
              type: "streaming_state",
              chatThreadId: stateThreadId,
              thoughtContent: stateSnap.thoughtContent,
              messageContent: stateSnap.messageContent,
              promptId: stateSnap.promptId,
              timestamp: new Date().toISOString(),
            }),
          );
        }

        const replayCommands = pipeline.getAvailableCommands(
          sessionId,
          stateThreadId,
        );
        if (replayCommands) {
          ws.send(
            JSON.stringify({
              type: "available_commands_update",
              chatThreadId: stateThreadId,
              commands: replayCommands,
              timestamp: new Date().toISOString(),
            }),
          );
        }
        break;

      case "request_acp_status":
        {
          const reqSessionId = data.sessionId;
          if (!reqSessionId) break;

          const reqSession = await sessionRepository.findById(reqSessionId);
          if (reqSession) {
            ws.send(
              JSON.stringify({
                type: "acp_status",
                sessionId: reqSessionId,
                status: reqSession.acpStatus || "active",
                timestamp: new Date().toISOString(),
              }),
            );
          }
        }
        break;

      case "request_impact_stale":
        {
          const staleSession = await sessionRepository.findById(sessionId);
          if (!staleSession) {
            break;
          }

          ws.send(
            JSON.stringify({
              type: "impact_stale",
              sessionId,
              stale: sccService.isStale(staleSession.agentWorkspacePath),
              timestamp: new Date().toISOString(),
            }),
          );
        }
        break;

      case "refresh_impact":
        void handleRefreshImpact({
          sessionId,
          calculatingSessions,
          sendToRequester: (message) => ws.send(JSON.stringify(message)),
          broadcast: (targetSessionId, message) =>
            broadcastToSession(chatSessions, targetSessionId, message),
          findSessionById: (targetSessionId) =>
            sessionRepository.findById(targetSessionId),
          calculateImpact: (sid, upstreamPath, workspacePath, forceRefresh) =>
            impactCalculator.calculateImpact(
              sid,
              upstreamPath,
              workspacePath,
              forceRefresh,
            ),
        }).catch((err) => {
          logger.error("[impact] refresh_impact handler failed:", err);
        });
        break;

      case "cancel_request":
        {
          const cancelSessionId = data.sessionId;
          if (!cancelSessionId) {
            logger.debug("No sessionId in cancel_request");
            return;
          }

          const cancelSession =
            await sessionRepository.findById(cancelSessionId);
          const cancelThreadId =
            data.chatThreadId || cancelSession?.activeChatThreadId;
          if (!cancelThreadId) {
            logger.debug(
              `Cancel request skipped for session ${cancelSessionId}: no active thread`,
            );
            break;
          }

          const cancelAgentId = resolveAgentId(cancelSession, cancelThreadId);
          if (cancelAgentId) {
            const cancelAgentWs =
              agentService.getAgentConnection(cancelAgentId);
            if (cancelAgentWs && cancelAgentWs.readyState === 1) {
              cancelAgentWs.send(
                JSON.stringify({
                  type: "cancel_request",
                  sessionId: cancelSessionId,
                  chatThreadId: cancelThreadId,
                  timestamp: new Date().toISOString(),
                }),
              );
              logger.debug(
                `Cancel request forwarded to agent for session ${cancelSessionId}/${cancelThreadId}`,
              );
            }
          }

          await pipeline.flushAsCancelled(cancelSessionId, cancelThreadId, {
            activeChatThreadId: cancelSession?.activeChatThreadId ?? undefined,
          });
          pipeline.deleteExpertPending(cancelSessionId, cancelThreadId);
        }
        break;

      case "clear_session":
        {
          const clearSessionId = data.sessionId;
          if (!clearSessionId) {
            logger.debug("No sessionId in clear_session");
            return;
          }

          const clearSession = await sessionRepository.findById(clearSessionId);
          const clearThreadId =
            data.chatThreadId || clearSession?.activeChatThreadId;

          if (!clearThreadId) {
            logger.debug(
              `[clear_session] Skipped for session ${clearSessionId}: no active thread`,
            );
            break;
          }

          logger.debug(
            `[clear_session] Received for session ${clearSessionId}/${clearThreadId}`,
          );

          const clearAgentId = resolveAgentId(clearSession, clearThreadId);
          if (clearAgentId) {
            const clearAgentWs = agentService.getAgentConnection(clearAgentId);
            if (clearAgentWs && clearAgentWs.readyState === 1) {
              clearAgentWs.send(
                JSON.stringify({
                  type: "clear_session",
                  sessionId: clearSessionId,
                  chatThreadId: clearThreadId,
                  timestamp: new Date().toISOString(),
                }),
              );
              logger.debug(
                `Clear session request forwarded to agent for session ${clearSessionId}/${clearThreadId}`,
              );
            } else {
              logger.debug(
                `[clear_session] Agent not connected for session ${clearSessionId}`,
              );
              const subscribers = chatSessions.get(clearSessionId);
              if (subscribers) {
                subscribers.forEach((client) => {
                  if (client.readyState === 1) {
                    client.send(
                      JSON.stringify({
                        type: "clear_session_error",
                        chatThreadId: clearThreadId,
                        error: "Agent not connected",
                        timestamp: new Date().toISOString(),
                      }),
                    );
                  }
                });
              }
            }
          } else {
            logger.debug(
              `[clear_session] No agent assigned to session ${clearSessionId}`,
            );
            const subscribers = chatSessions.get(clearSessionId);
            if (subscribers) {
              subscribers.forEach((client) => {
                if (client.readyState === 1) {
                  client.send(
                    JSON.stringify({
                      type: "clear_session_error",
                      chatThreadId: clearThreadId,
                      error: "No agent assigned to session",
                      timestamp: new Date().toISOString(),
                    }),
                  );
                }
              });
            }
          }
        }
        break;

      case "request_replay":
        const replaySession = await sessionRepository.findById(sessionId);
        const replayThreadId =
          data.chatThreadId || replaySession?.activeChatThreadId;
        const history = await chatService.loadHistory(
          sessionId,
          replayThreadId,
        );
        ws.send(
          JSON.stringify({
            type: "history",
            messages: history,
            chatThreadId: replayThreadId,
          }),
        );
        break;

      case "permission_response":
        {
          const { requestId, optionId } = data;
          await agentRouter.routePermissionResponse(requestId, optionId);
        }
        break;

      default:
        logger.debug("Unknown chat message type:", data.type);
    }
  }

  async function handleFilesMessage(ws: any, data: any) {
    console.log(
      `[WS Files] handleFilesMessage called with:`,
      JSON.stringify(data),
    );
    const sessionId = ws.data.sessionId;
    console.log(`[WS Files] Session ID from ws.data:`, sessionId);

    switch (data.type) {
      case "watch_file": {
        console.log(`[WS Files] Processing watch_file request`);
        const { path: filePath, checksum: currentChecksum } = data;
        console.log(
          `[WS Files] File path: ${filePath}, checksum: ${currentChecksum}`,
        );
        if (!filePath || !currentChecksum) {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Missing path or checksum",
            }),
          );
          break;
        }

        try {
          const session = await sessionRepository.findById(sessionId);
          if (!session) {
            ws.send(
              JSON.stringify({
                type: "error",
                error: "Session not found",
              }),
            );
            break;
          }

          const fullPath = join(session.agentWorkspacePath, filePath);

          logger.debug(
            `[WS Files] Calling watchFile for ${fullPath} with checksum ${currentChecksum}`,
          );
          await fileWatcher.watchFile(
            sessionId,
            fullPath,
            currentChecksum,
            (event) => {
              logger.debug(
                `[WS Files] File watcher callback triggered:`,
                event,
              );
              const connections = fileWatchSessions.get(sessionId);
              if (connections) {
                let sentCount = 0;
                connections.forEach((conn) => {
                  if (conn.readyState === 1) {
                    logger.debug(
                      `[WS Files] Sending ${event.type} to client for ${filePath}`,
                    );
                    conn.send(
                      JSON.stringify({
                        type: event.type,
                        path: filePath,
                        checksum: event.checksum,
                      }),
                    );
                    sentCount++;
                  }
                });
                logger.debug(
                  `[WS Files] Sent event to ${sentCount} connection(s), ${connections.size - sentCount} unavailable`,
                );
              } else {
                logger.debug(
                  `[WS Files] No file watcher connections found for session ${sessionId}`,
                );
              }
            },
          );

          logger.debug(
            `[WS Files] Successfully started watching ${filePath} for session ${sessionId}`,
          );
          logger.debug(
            `[FileWatcher] Started watching ${filePath} for session ${sessionId}`,
          );
        } catch (error) {
          logger.error(`[FileWatcher] Error watching file: ${error}`);
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Failed to watch file",
            }),
          );
        }
        break;
      }

      case "unwatch_file": {
        const { path: filePath } = data;
        if (!filePath) {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Missing path",
            }),
          );
          break;
        }

        try {
          const session = await sessionRepository.findById(sessionId);
          if (session) {
            const fullPath = join(session.agentWorkspacePath, filePath);
            fileWatcher.unwatchFile(sessionId, fullPath);
            logger.debug(
              `[FileWatcher] Stopped watching ${filePath} for session ${sessionId}`,
            );
          }
        } catch (error) {
          logger.error(`[FileWatcher] Error unwatching file: ${error}`);
        }
        break;
      }

      default:
        logger.debug("Unknown files message type:", data.type);
    }
  }

  async function cleanupFileWatchSession(ws: any) {
    const sessionId = ws.data?.sessionId;
    if (!sessionId) return;

    const connections = fileWatchSessions.get(sessionId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        fileWatchSessions.delete(sessionId);
        logger.debug(
          `[FileWatcher] All connections closed for session ${sessionId}, keeping file watches`,
        );
      }
    }
  }

  return {
    handleAgentMessage,
    handleChatMessage,
    handleFilesMessage,
    cleanupFileWatchSession,
    broadcastImpactStale,
    generateToolCallsHtml,
  };
}

export interface WebSocketSetupDeps extends WebSocketHandlerDeps {
  authService: Pick<JwtService, "verifyToken">;
}

export function createWebSocketSetup(deps: WebSocketSetupDeps) {
  const wsHandlers = createWebSocketHandlers(deps);
  const {
    sessionRepository,
    agentService,
    agentRouter,
    pipeline,
    chatSessions,
    fileWatchSessions,
    authService,
  } = deps;

  async function handleUpgrade(
    req: Request,
    server: any,
  ): Promise<Response | undefined> {
    const url = new URL(req.url);
    const type = url.pathname.split("/")[2];

    logger.debug("[WS] Upgrade request for path:", url.pathname, "type:", type);

    if (type === "agent") {
      const token = url.searchParams.get("token");
      if (!token) {
        logger.debug("[WS] Missing token");
        return new Response("Missing token", { status: 400 });
      }

      const payload = await agentService.verifyAgentToken(token);
      if (!payload) {
        logger.debug("[WS] Invalid token");
        return new Response("Invalid token", { status: 401 });
      }

      logger.debug("[WS] Token verified, agentId:", payload.agentId);

      const upgraded = server.upgrade(req, {
        data: {
          connectionType: "agent",
          agentId: payload.agentId,
          url: req.url,
        },
      });

      if (!upgraded) {
        logger.debug("[WS] WebSocket upgrade failed");
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      logger.debug(
        "[WS] WebSocket upgraded successfully for agent:",
        payload.agentId,
      );
      return undefined;
    }

    if (type === "chat") {
      const sessionId = url.pathname.split("/")[3];
      if (!sessionId) {
        return new Response("Missing sessionId", { status: 400 });
      }

      const session = await sessionRepository.findById(sessionId);
      if (!session) {
        logger.debug("[WS] Chat WebSocket: Session not found", sessionId);
        return new Response("Session not found", { status: 404 });
      }

      const cookieHeader = req.headers.get("Cookie") || "";
      const tokenMatch = cookieHeader.match(/token=([^;]+)/);
      const token = tokenMatch ? tokenMatch[1] : null;

      if (!token) {
        logger.debug("[WS] Chat WebSocket: Missing token");
        return new Response("Unauthorized", { status: 401 });
      }

      const payload = await authService.verifyToken(token);
      if (!payload) {
        logger.debug("[WS] Chat WebSocket: Invalid token");
        return new Response("Unauthorized", { status: 401 });
      }

      if (session.owner !== payload.username) {
        logger.debug("[WS] Chat WebSocket: Unauthorized", {
          username: payload.username,
          owner: session.owner,
        });
        return new Response("Unauthorized", { status: 401 });
      }

      logger.debug("[WS] Chat WebSocket: Authenticated upgrade for", sessionId);

      const upgraded = server.upgrade(req, {
        data: {
          connectionType: "chat",
          sessionId,
          url: req.url,
        },
      });

      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return undefined;
    }

    if (type === "files") {
      const sessionId = url.pathname.split("/")[3];
      if (!sessionId) {
        logger.debug("[WS] Files WebSocket: Missing sessionId");
        return new Response("Missing sessionId", { status: 400 });
      }

      const session = await sessionRepository.findById(sessionId);
      if (!session) {
        logger.debug("[WS] Files WebSocket: Session not found", sessionId);
        return new Response("Session not found", { status: 404 });
      }

      const cookieHeader = req.headers.get("Cookie") || "";
      const usernameMatch = cookieHeader.match(/username=([^;]+)/);
      const username = usernameMatch?.[1]
        ? decodeURIComponent(usernameMatch[1])
        : null;

      logger.debug("[WS] Files WebSocket: Auth check", {
        sessionId,
        username: username || "null",
        owner: session.owner,
      });

      if (!username || session.owner !== username) {
        logger.debug("[WS] Files WebSocket: Unauthorized", {
          username,
          owner: session.owner,
        });
        return new Response("Unauthorized", { status: 401 });
      }

      logger.debug("[WS] Files WebSocket: Upgrading connection for", sessionId);

      const upgraded = server.upgrade(req, {
        data: {
          connectionType: "files",
          sessionId,
          url: req.url,
        },
      });

      if (!upgraded) {
        logger.debug("[WS] Files WebSocket: Upgrade failed");
        return new Response("WebSocket upgrade failed", { status: 500 });
      }

      logger.debug("[WS] Files WebSocket: Upgrade successful for", sessionId);
      return undefined;
    }

    return new Response("Unknown WebSocket endpoint", { status: 404 });
  }

  const websocket = {
    async message(ws: any, message: any) {
      try {
        const data = JSON.parse(message as string);
        const connectionType = ws.data?.connectionType;

        switch (connectionType) {
          case "agent":
            await wsHandlers.handleAgentMessage(ws, data);
            break;
          case "chat":
            await wsHandlers.handleChatMessage(ws, data);
            break;
          case "files":
            await wsHandlers.handleFilesMessage(ws, data);
            break;
          default:
            logger.debug("Unknown connection type");
        }
      } catch (error) {
        logger.error("WebSocket message error:", error);
      }
    },
    async open(ws: any) {
      const url = new URL(ws.data.url);
      const type = url.pathname.split("/")[2];

      if (type === "chat") {
        const sessionId = url.pathname.split("/")[3];
        if (!sessionId) {
          ws.close(1008, "Missing sessionId");
          return;
        }
        ws.data.connectionType = "chat";
        ws.data.sessionId = sessionId;

        if (!chatSessions.has(sessionId)) {
          chatSessions.set(sessionId, new Set());
        }
        chatSessions.get(sessionId)!.add(ws);

        const sessionRecord = await sessionRepository.findById(sessionId);
        const activeThreadId = sessionRecord?.activeChatThreadId;

        const history = await deps.chatService.loadHistory(
          sessionId,
          activeThreadId ?? undefined,
        );
        ws.send(
          JSON.stringify({
            type: "history",
            messages: history,
            chatThreadId: activeThreadId,
          }),
        );

        const openSnap = pipeline.getStreamingSnapshot(
          sessionId,
          activeThreadId ?? undefined,
        );
        if (
          (openSnap.thoughtContent || openSnap.messageContent) &&
          deps.chatService.isAgentAlive(sessionId)
        ) {
          ws.send(
            JSON.stringify({
              type: "streaming_state",
              chatThreadId: activeThreadId,
              thoughtContent: openSnap.thoughtContent,
              messageContent: openSnap.messageContent,
              promptId: openSnap.promptId,
              timestamp: new Date().toISOString(),
            }),
          );
        }

        const openCommands = pipeline.getAvailableCommands(
          sessionId,
          activeThreadId ?? undefined,
        );
        if (openCommands && openCommands.length > 0) {
          ws.send(
            JSON.stringify({
              type: "available_commands_update",
              chatThreadId: activeThreadId,
              commands: openCommands,
              timestamp: new Date().toISOString(),
            }),
          );
        }

        logger.debug(`Chat client connected to session ${sessionId}`);
      } else if (type === "files") {
        const sessionId = url.pathname.split("/")[3];
        if (!sessionId) {
          ws.close(1008, "Missing sessionId");
          return;
        }
        ws.data.connectionType = "files";
        ws.data.sessionId = sessionId;

        if (!fileWatchSessions.has(sessionId)) {
          fileWatchSessions.set(sessionId, new Set());
        }
        fileWatchSessions.get(sessionId)!.add(ws);

        logger.debug(`File watcher client connected to session ${sessionId}`);
      } else {
        const token = url.searchParams.get("token");

        if (!token) {
          ws.close(1008, "Missing token");
          return;
        }

        const payload = await agentService.verifyAgentToken(token);
        if (!payload) {
          ws.close(1008, "Invalid token");
          return;
        }

        ws.data.connectionType = "agent";
        ws.data.agentId = payload.agentId;
        ws.data.authenticated = true;

        await agentService.handleAgentConnect(payload.agentId, ws);
        logger.debug(
          `Agent ${payload.agentId} connected, waiting for agent_ready`,
        );
      }
    },
    async close(ws: any) {
      const connectionType = ws.data?.connectionType;

      if (connectionType === "chat") {
        const sessionId = ws.data.sessionId;
        const sessionClients = chatSessions.get(sessionId);
        if (sessionClients) {
          sessionClients.delete(ws);
          if (sessionClients.size === 0) {
            chatSessions.delete(sessionId);
            agentRouter.autoRejectPendingPermissionsForSession(sessionId, null);
          }
        }
        logger.debug(`Chat client disconnected from session ${sessionId}`);
      } else if (connectionType === "agent") {
        const agentId = ws.data.agentId;
        if (agentId) {
          await agentService.handleAgentDisconnect(agentId);
          const [sessionLevelSessions, threadLevelSessions] = await Promise.all(
            [
              sessionRepository.findByAssignedAgentId(agentId),
              sessionRepository.findByThreadAgentId(agentId),
            ],
          );
          const seenSessionIds = new Set<string>();
          for (const session of [
            ...sessionLevelSessions,
            ...threadLevelSessions,
          ]) {
            if (seenSessionIds.has(session.id)) {
              continue;
            }
            seenSessionIds.add(session.id);
            pipeline.clearPromptInFlight(
              session.id,
              session.activeChatThreadId,
            );
            if (Array.isArray(session.chatThreads)) {
              for (const thread of session.chatThreads) {
                if (thread?.id) {
                  pipeline.clearPromptInFlight(session.id, thread.id);
                }
              }
            }
          }
          logger.debug(`Agent ${agentId} disconnected`);
        }
      } else if (connectionType === "files") {
        await wsHandlers.cleanupFileWatchSession(ws);
        logger.debug(
          `File watcher client disconnected from session ${ws.data.sessionId}`,
        );
      }
    },
  };

  return { handleUpgrade, websocket, wsHandlers };
}
