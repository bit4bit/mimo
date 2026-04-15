import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createAuthRoutes } from "./auth/routes";
import protectedRoutes from "./protected/routes";
import { createProjectsRoutes } from "./projects/routes";
import { createAgentsRoutes } from "./agents/routes.js";
import { createSessionsRoutes } from "./sessions/routes";
import { createDashboardRoutes } from "./dashboard/routes";
import { createSyncRoutes } from "./sync/routes";
import { createCommitRoutes } from "./commits/routes";
import { createConfigRoutes } from "./config/routes";
import { createCredentialsRoutes } from "./credentials/routes";
import { createMcpServerRoutes } from "./mcp-servers/routes";
import {
  createAutoCommitRouter,
  resolveAgentSyncNowResult,
  syncSessionViaAssignedAgent,
} from "./auto-commit/routes";
import { LandingPage } from "./components/LandingPage.js";
import { sharedFossilServer } from "./vcs/shared-fossil-server.js";
import { handleRefreshImpact } from "./impact/refresh-handler.js";

import {
  broadcastToSession,
  type SessionWsClient,
} from "./ws/session-broadcast.js";
import { relative } from "path";
import { MimoServer } from "./server/mimo-server.js";
import { createMimoContext } from "./context/mimo-context.js";
import { logger } from "./logger.js";

const app = new Hono();
const _port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const mimoContext = createMimoContext({
  env: {
    PORT: _port,
    PLATFORM_URL: process.env.PLATFORM_URL ?? `http://localhost:${_port}`,
    JWT_SECRET:
      process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
    MIMO_HOME: process.env.MIMO_HOME,
    FOSSIL_REPOS_DIR: process.env.FOSSIL_REPOS_DIR,
    MIMO_SHARED_FOSSIL_SERVER_PORT: process.env.MIMO_SHARED_FOSSIL_SERVER_PORT
      ? parseInt(process.env.MIMO_SHARED_FOSSIL_SERVER_PORT, 10)
      : undefined,
  },
});
sharedFossilServer.configure({
  reposDir: mimoContext.env.FOSSIL_REPOS_DIR,
  port: mimoContext.env.MIMO_SHARED_FOSSIL_SERVER_PORT,
});
mimoContext.services.scc.configure({ mimoHome: mimoContext.env.MIMO_HOME });
const agentService = mimoContext.services.agents;
const sessionRepository = mimoContext.repos.sessions;
const PORT = mimoContext.env.PORT;
const PLATFORM_URL = mimoContext.env.PLATFORM_URL;

function createMimoServer() {
  return new MimoServer({
    serve: (config) => Bun.serve(config as any) as any,
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    ensureSharedFossilRunning: () => sharedFossilServer.ensureRunning(),
    getSharedFossilPort: () => sharedFossilServer.getPort(),
    logger: console,
  });
}

const mimoServer = createMimoServer();

// Serve static files from public/
app.use("/js/*", serveStatic({ root: "./public" }));

import { sessionStateService } from "./sessions/state.js";

// Track active chat sessions
const chatSessions = new Map<string, Set<SessionWsClient>>();
const calculatingSessions = new Set<string>();

// Track streaming message and thought buffers per session
const streamingBuffers = new Map<string, string>();
const thoughtBuffers = new Map<string, string>();
const autoSyncInFlight = new Set<string>();

// Track pending permission requests: requestId → { agentWs, sessionId }
const pendingPermissions = new Map<
  string,
  { agentWs: any; sessionId: string }
>();

async function broadcastImpactStale(sessionId: string): Promise<void> {
  try {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return;
    }

    broadcastToSession(chatSessions, sessionId, {
      type: "impact_stale",
      sessionId,
      stale: mimoContext.services.scc.isStale(session.agentWorkspacePath),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[impact] Failed to broadcast stale status:", error);
  }
}

mimoContext.services.fileSync.setImpactStaleHandler((sessionId: string) => {
  void broadcastImpactStale(sessionId);
});

// Auth routes
app.route("/auth", createAuthRoutes(mimoContext));

// Dashboard (protected)
app.route("/dashboard", createDashboardRoutes(mimoContext));

// Landing page (public)
app.get("/", async (c) => {
  const publicProjects = await mimoContext.repos.projects.listAllPublic();
  const user = c.get("user") as { username: string } | undefined;
  const isAuthenticated = !!user;
  const username = user?.username;

  // If authenticated, redirect to dashboard
  if (isAuthenticated) {
    return c.redirect("/dashboard");
  }

  return c.html(
    <LandingPage
      projects={publicProjects}
      isAuthenticated={isAuthenticated}
      username={username}
    />,
  );
});

// Public projects API (no auth required)
app.get("/api/projects/public", async (c) => {
  const publicProjects = await mimoContext.repos.projects.listAllPublic();
  return c.json(publicProjects);
});

// Protected routes
app.route("/", protectedRoutes);

// Project routes (protected)
app.route("/projects", createProjectsRoutes(mimoContext));

// Session routes (protected)
app.route("/sessions", createSessionsRoutes(mimoContext));

// Agent routes (protected)
app.route("/agents", createAgentsRoutes(mimoContext));

// File sync routes (protected)
app.route("/sync", createSyncRoutes(mimoContext));

// Commit routes (protected)
app.route("/commits", createCommitRoutes(mimoContext));

// Config routes (protected)
app.route("/config", createConfigRoutes(mimoContext));

// Credentials routes (protected)
app.route("/credentials", createCredentialsRoutes(mimoContext));

// MCP Server routes (protected)
app.route("/mcp-servers", createMcpServerRoutes(mimoContext));

// Auto-commit routes (protected)
app.route(
  "/sessions",
  createAutoCommitRouter(mimoContext.services.autoCommit, {
    sessionRepository: mimoContext.repos.sessions,
    agentService: mimoContext.services.agents,
    sccService: mimoContext.services.scc,
  }),
);

// Health check
app.get("/health", (c) => {
  logger.debug("Health check hit");
  return c.json({ status: "healthy" });
});

// 404 handler
app.notFound((c) => {
  logger.debug(`404: ${c.req.url}`);
  return c.json({ error: "Not Found", path: c.req.path }, 404);
});

mimoServer.setup({
  async fetch(req: Request, server: any) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade requests
    if (req.headers.get("upgrade") === "websocket") {
      const type = url.pathname.split("/")[2]; // /ws/agent or /ws/chat

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

      return new Response("Unknown WebSocket endpoint", { status: 404 });
    }

    return app.fetch(req);
  },
  port: PORT,
  websocket: {
    // WebSocket handler for different connection types
    async message(ws, message) {
      try {
        const data = JSON.parse(message as string);
        const connectionType = ws.data?.connectionType;

        switch (connectionType) {
          case "agent":
            await handleAgentMessage(ws, data);
            break;
          case "chat":
            await handleChatMessage(ws, data);
            break;
          default:
            logger.debug("Unknown connection type");
        }
      } catch (error) {
        logger.error("WebSocket message error:", error);
      }
    },
    async open(ws) {
      const url = new URL(ws.data.url);
      const type = url.pathname.split("/")[2]; // /ws/chat or /ws/agent

      if (type === "chat") {
        // Chat connection
        const sessionId = url.pathname.split("/")[3];
        ws.data.connectionType = "chat";
        ws.data.sessionId = sessionId;

        // Add to session subscribers
        if (!chatSessions.has(sessionId)) {
          chatSessions.set(sessionId, new Set());
        }
        chatSessions.get(sessionId).add(ws);

        // Send chat history
        const history = await mimoContext.services.chat.loadHistory(sessionId);
        ws.send(
          JSON.stringify({
            type: "history",
            messages: history,
          }),
        );

        // Send current streaming state if agent is actively responding and alive
        const thoughtContent = thoughtBuffers.get(sessionId);
        const messageContent = streamingBuffers.get(sessionId);

        // Only send streaming state if agent is actually alive
        if (
          (thoughtContent || messageContent) &&
          mimoContext.services.chat.isAgentAlive(sessionId)
        ) {
          ws.send(
            JSON.stringify({
              type: "streaming_state",
              thoughtContent: thoughtContent || "",
              messageContent: messageContent || "",
              timestamp: new Date().toISOString(),
            }),
          );
        }

        logger.debug(`Chat client connected to session ${sessionId}`);
      } else {
        // Agent connection
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
        ws.data.authenticated = true; // Mark as authenticated, waiting for agent_ready

        await agentService.handleAgentConnect(payload.agentId, ws);
        logger.debug(
          `Agent ${payload.agentId} connected, waiting for agent_ready`,
        );
      }
    },
    async close(ws) {
      const connectionType = ws.data?.connectionType;

      if (connectionType === "chat") {
        // Remove from session subscribers
        const sessionId = ws.data.sessionId;
        if (chatSessions.has(sessionId)) {
          chatSessions.get(sessionId).delete(ws);
          if (chatSessions.get(sessionId).size === 0) {
            chatSessions.delete(sessionId);

            // Auto-reject any pending permission requests for this session
            for (const [requestId, pending] of pendingPermissions) {
              if (pending.sessionId === sessionId) {
                pendingPermissions.delete(requestId);
                if (pending.agentWs.readyState === 1) {
                  pending.agentWs.send(
                    JSON.stringify({
                      type: "permission_response",
                      requestId,
                      outcome: { outcome: "cancelled" },
                    }),
                  );
                }
              }
            }
          }
        }
        logger.debug(`Chat client disconnected from session ${sessionId}`);
      } else if (connectionType === "agent") {
        const agentId = ws.data.agentId;
        if (agentId) {
          await agentService.handleAgentDisconnect(agentId);
          logger.debug(`Agent ${agentId} disconnected`);

          // Note: With shared fossil server, no per-session servers to stop
          // The shared server continues running for all sessions
        }
      }
    },
  },
});

const server = mimoServer.start();

// Handle agent messages
async function triggerAutoSync(
  sessionId: string,
  reason: "thought_end" | "usage_update",
): Promise<void> {
  if (autoSyncInFlight.has(sessionId)) {
    logger.debug(
      `[auto-commit] Skipping ${reason} sync for ${sessionId} (in-flight)`,
    );
    return;
  }

  autoSyncInFlight.add(sessionId);

  try {
    const result = await syncSessionViaAssignedAgent(sessionId, {
      autoCommitService: mimoContext.services.autoCommit,
      sessionRepository: mimoContext.repos.sessions,
      agentService: mimoContext.services.agents,
      sccService: mimoContext.services.scc,
    });
    const status = result.syncStatus;
    const syncSubscribers = chatSessions.get(sessionId);
    if (!syncSubscribers) {
      return;
    }

    syncSubscribers.forEach((client) => {
      if (client.readyState === 1) {
        client.send(
          JSON.stringify({
            type: "sync_status",
            sessionId,
            success: result.success,
            message: result.message,
            error: result.error,
            status,
            reason,
            timestamp: new Date().toISOString(),
          }),
        );
      }
    });
  } catch (error) {
    logger.error(`[auto-commit] Failed on ${reason}:`, error);
  } finally {
    autoSyncInFlight.delete(sessionId);
  }
}

async function handleAgentMessage(ws, data) {
  logger.debug("[agent] Received message:", data.type, data);
  process.stdout?.write?.(""); // Flush stdout

  switch (data.type) {
    case "ping":
      ws.send(JSON.stringify({ type: "pong" }));
      break;
    case "agent_ready":
      logger.debug(
        "[agent] Agent ready:",
        data.agentId,
        "workdir:",
        data.workdir,
      );
      process.stdout?.write?.(""); // Flush stdout

      // Store workdir for relative path computation
      const agentId = ws.data.agentId;
      if (data.workdir) {
        agentService.handleAgentConnect(agentId, ws, data.workdir);
      }

      // Start Fossil servers for sessions assigned to this agent
      // Note: Sessions are assigned via assignedAgentId, not in agent.sessionIds
      const sessions = await sessionRepository.findByAssignedAgentId(agentId);
      logger.debug(
        "[agent] Found",
        sessions.length,
        "sessions assigned to agent",
        agentId,
      );
      process.stdout?.write?.(""); // Flush stdout

      if (sessions.length > 0) {
        const sessionsReady = [];
        const workdir = agentService.getAgentWorkdir(agentId);
        logger.debug("[agent] Workdir:", workdir);
        process.stdout?.write?.(""); // Flush stdout

        // Use shared fossil server - no per-session server to start
        for (const session of sessions) {
          const sessionId = session.id;
          logger.debug(
            "[agent] Session:",
            sessionId,
            "status:",
            session.status,
          );
          process.stdout?.write?.(""); // Flush stdout

          if (session.status === "active") {
            const fossilPath = sessionRepository.getFossilPath(sessionId);
            const fossilUrl = sharedFossilServer.getUrl(sessionId);
            logger.debug(
              "[agent] Using shared fossil server for session:",
              sessionId,
              "fossil:",
              fossilPath,
              "url:",
              fossilUrl,
            );
            process.stdout?.write?.(""); // Flush stdout

            // Get session with credentials
            const sessionWithCreds =
              await sessionRepository.findById(sessionId);

            // Resolve MCP servers attached to this session
            let mcpServers: any[] = [];
            if (
              sessionWithCreds?.mcpServerIds &&
              sessionWithCreds.mcpServerIds.length > 0
            ) {
              try {
                mcpServers =
                  await mimoContext.services.mcpServer.resolveMcpServers(
                    sessionWithCreds.mcpServerIds,
                  );
              } catch (err) {
                logger.error(
                  `[agent] Failed to resolve MCP servers for session ${sessionId}:`,
                  err,
                );
              }
            }

            sessionsReady.push({
              sessionId,
              name: session.name,
              upstreamPath: session.upstreamPath,
              agentWorkspacePath: session.agentWorkspacePath,
              fossilUrl,
              agentWorkspaceUser: sessionWithCreds?.agentWorkspaceUser,
              agentWorkspacePassword: sessionWithCreds?.agentWorkspacePassword,
              acpSessionId: sessionWithCreds?.acpSessionId ?? null,
              modelState: sessionWithCreds?.modelState ?? null,
              modeState: sessionWithCreds?.modeState ?? null,
              localDevMirrorPath: sessionWithCreds?.localDevMirrorPath ?? null,
              agentSubpath: sessionWithCreds?.agentSubpath ?? null,
              mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
            });
          }
        }

        // Send session_ready message to agent
        if (sessionsReady.length > 0) {
          const message = {
            type: "session_ready",
            platformUrl: PLATFORM_URL,
            sessions: sessionsReady,
          };
          logger.debug(
            "[agent] Sending session_ready:",
            JSON.stringify(message),
          );
          process.stdout?.write?.(""); // Flush stdout
          ws.send(JSON.stringify(message));
        } else {
          logger.debug("[agent] No sessions ready to send");
        }
      } else {
        logger.debug("[agent] No sessions assigned to agent");
      }
      break;
    case "thought_start":
      {
        const startSessionId = data.sessionId;
        if (!startSessionId) {
          logger.debug("No sessionId in thought_start");
          return;
        }

        // Track agent activity so isAgentAlive() stays true between chunk phases
        mimoContext.services.chat.updateAgentActivity(startSessionId);

        // Start new thought buffer
        thoughtBuffers.set(startSessionId, "");

        // Forward to clients
        const subscribers = chatSessions.get(startSessionId);
        if (subscribers) {
          subscribers.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: data.type,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }
      }
      break;

    case "thought_chunk":
      {
        const chunkSessionId = data.sessionId;
        if (!chunkSessionId) {
          logger.debug("No sessionId in thought_chunk");
          return;
        }

        // Track agent activity for health monitoring
        mimoContext.services.chat.updateAgentActivity(chunkSessionId);

        // Accumulate thought chunks
        const currentThoughtBuffer = thoughtBuffers.get(chunkSessionId) || "";
        thoughtBuffers.set(
          chunkSessionId,
          currentThoughtBuffer + (data.content || ""),
        );

        // Forward to clients
        const thoughtChunkSubscribers = chatSessions.get(chunkSessionId);
        if (thoughtChunkSubscribers) {
          thoughtChunkSubscribers.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: data.type,
                  content: data.content,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }
      }
      break;

    case "thought_end":
      {
        const endSessionId = data.sessionId;
        if (!endSessionId) {
          logger.debug("No sessionId in thought_end");
          return;
        }

        // Forward to clients
        const endSubscribers = chatSessions.get(endSessionId);
        if (endSubscribers) {
          endSubscribers.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: data.type,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }

        void triggerAutoSync(endSessionId, "thought_end");
      }
      break;

    case "message_chunk":
      {
        const msgSessionId = data.sessionId;
        if (!msgSessionId) {
          logger.debug("No sessionId in message_chunk");
          return;
        }

        // Track agent activity for health monitoring
        mimoContext.services.chat.updateAgentActivity(msgSessionId);

        // Accumulate message chunks
        const currentBuffer = streamingBuffers.get(msgSessionId) || "";
        streamingBuffers.set(
          msgSessionId,
          currentBuffer + (data.content || ""),
        );

        // Forward to clients
        const msgSubscribers = chatSessions.get(msgSessionId);
        if (msgSubscribers) {
          msgSubscribers.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: data.type,
                  content: data.content,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }
      }
      break;

    case "usage_update":
      {
        const usageSessionId = data.sessionId;
        if (!usageSessionId) {
          logger.debug("No sessionId in usage_update");
          return;
        }

        // Get accumulated message and thoughts
        const messageContent = streamingBuffers.get(usageSessionId);
        const thoughtContent = thoughtBuffers.get(usageSessionId);

        const hasBufferedAssistantOutput = Boolean(
          messageContent || thoughtContent,
        );

        if (hasBufferedAssistantOutput) {
          // Save assistant response with optional thoughts
          let fullContent = messageContent || "";

          // Prepend thoughts if present
          if (thoughtContent) {
            fullContent = `<details><summary>Thought Process</summary>${thoughtContent}</details>\n\n${fullContent}`;
            thoughtBuffers.delete(usageSessionId);
          }

          await mimoContext.services.chat.saveMessage(usageSessionId, {
            role: "assistant",
            content: fullContent,
            timestamp: new Date().toISOString(),
          });

          // Clear buffer
          streamingBuffers.delete(usageSessionId);
        }

        // Forward usage update to clients
        const usageSubscribers = chatSessions.get(usageSessionId);
        if (usageSubscribers) {
          usageSubscribers.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: data.type,
                  usage: data.usage,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }

        void triggerAutoSync(usageSessionId, "usage_update");
      }
      break;

    case "acp_response":
      // Legacy: Handle simple ACP response and broadcast to chat
      // Agent must specify which session this is for
      const sessionId = data.sessionId;
      if (!sessionId) {
        logger.debug("No sessionId in acp_response");
        return;
      }

      // Broadcast to all chat clients in session
      const subscribers = chatSessions.get(sessionId);
      if (subscribers) {
        subscribers.forEach((client) => {
          if (client.readyState === 1) {
            // WebSocket.OPEN
            client.send(
              JSON.stringify({
                type: "message",
                role: "assistant",
                content: data.content,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        });
      }

      // Save to history
      await mimoContext.services.chat.saveMessage(sessionId, {
        role: "assistant",
        content: data.content,
        timestamp: new Date().toISOString(),
      });
      break;
    case "file_changed":
      logger.debug("File changed:", data.files);

      const fileSessionId = data.sessionId;
      if (!fileSessionId) {
        logger.debug("No sessionId in file_changed");
        return;
      }

      const changes = data.files.map((file) => ({
        path: file.path,
        isNew: file.isNew,
        deleted: file.deleted,
      }));

      await mimoContext.services.fileSync.initializeSession(
        fileSessionId,
        "",
        "",
      );
      await mimoContext.services.fileSync.handleFileChanges(
        fileSessionId,
        changes,
      );
      break;
    case "session_error":
      logger.debug("[agent] Session error:", data.sessionId, data.error);
      break;
    case "agent_sessions_ready":
      logger.debug("[agent] Agent sessions ready:", data.sessionIds);
      break;
    case "acp_session_created":
      {
        const { sessionId, acpSessionId, wasReset, resetReason } = data;
        logger.debug("[agent] ACP session created:", {
          sessionId,
          acpSessionId,
          wasReset,
          resetReason,
        });

        if (sessionId && acpSessionId) {
          await sessionRepository.update(sessionId, { acpSessionId });

          if (wasReset) {
            const timestamp = new Date().toISOString();
            const reasonText = resetReason ? ` (${resetReason})` : "";
            const systemMessage = `Session reset at ${timestamp}${reasonText}`;
            await mimoContext.services.chat.saveMessage(sessionId, {
              role: "system",
              content: systemMessage,
              timestamp,
            });
          }
        }
      }
      break;

    case "acp_session_cleared":
      {
        const { sessionId, acpSessionId } = data;
        logger.debug("[agent] ACP session cleared:", {
          sessionId,
          acpSessionId,
        });

        if (sessionId && acpSessionId) {
          // Update session with new acpSessionId
          await sessionRepository.update(sessionId, { acpSessionId });

          // Add system message to chat history
          const timestamp = new Date().toISOString();
          await mimoContext.services.chat.saveMessage(sessionId, {
            role: "system",
            content: "Session cleared - context reset",
            timestamp,
          });

          // Broadcast to all UI clients
          const clearedSubscribers = chatSessions.get(sessionId);
          if (clearedSubscribers) {
            clearedSubscribers.forEach((client: WebSocket) => {
              if (client.readyState === 1) {
                client.send(
                  JSON.stringify({
                    type: "session_cleared",
                    sessionId,
                    timestamp,
                  }),
                );
              }
            });
          }
        }
      }
      break;

    case "clear_session_error":
      {
        const { sessionId, error } = data;
        logger.debug("[agent] Clear session error:", { sessionId, error });

        if (sessionId) {
          // Broadcast error to all UI clients
          const errorSubscribers = chatSessions.get(sessionId);
          if (errorSubscribers) {
            errorSubscribers.forEach((client: WebSocket) => {
              if (client.readyState === 1) {
                client.send(
                  JSON.stringify({
                    type: "clear_session_error",
                    sessionId,
                    error,
                    timestamp: new Date().toISOString(),
                  }),
                );
              }
            });
          }
        }
      }
      break;
    case "session_initialized":
      // Store model/mode state from agent
      if (data.sessionId) {
        if (data.modelState) {
          sessionStateService.setModelState(data.sessionId, data.modelState);
          await sessionRepository.update(data.sessionId, {
            modelState: data.modelState,
          });
          logger.debug(
            `[agent] Session ${data.sessionId} model state:`,
            data.modelState.currentModelId,
          );
        }
        if (data.modeState) {
          sessionStateService.setModeState(data.sessionId, data.modeState);
          await sessionRepository.update(data.sessionId, {
            modeState: data.modeState,
          });
          logger.debug(
            `[agent] Session ${data.sessionId} mode state:`,
            data.modeState.currentModeId,
          );
        }

        // Broadcast to chat clients
        const initSubscribers = chatSessions.get(data.sessionId);
        if (initSubscribers) {
          const initMessage: any = {
            type: "session_initialized",
            sessionId: data.sessionId,
            timestamp: new Date().toISOString(),
          };
          if (data.modelState) {
            initMessage.modelState = data.modelState;
          }
          if (data.modeState) {
            initMessage.modeState = data.modeState;
          }

          initSubscribers.forEach((client: WebSocket) => {
            if (client.readyState === 1) {
              client.send(JSON.stringify(initMessage));
            }
          });
        }
      }
      break;
    case "model_state":
      // Update and broadcast model state
      if (data.sessionId && data.modelState) {
        sessionStateService.setModelState(data.sessionId, data.modelState);
        await sessionRepository.update(data.sessionId, {
          modelState: data.modelState,
        });

        const modelSubscribers = chatSessions.get(data.sessionId);
        if (modelSubscribers) {
          modelSubscribers.forEach((client: WebSocket) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: "model_state",
                  sessionId: data.sessionId,
                  modelState: data.modelState,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }
      }
      break;
    case "mode_state":
      // Update and broadcast mode state
      if (data.sessionId && data.modeState) {
        sessionStateService.setModeState(data.sessionId, data.modeState);
        await sessionRepository.update(data.sessionId, {
          modeState: data.modeState,
        });

        const modeSubscribers = chatSessions.get(data.sessionId);
        if (modeSubscribers) {
          modeSubscribers.forEach((client: WebSocket) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: "mode_state",
                  sessionId: data.sessionId,
                  modeState: data.modeState,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }
      }
      break;
    case "acp_status":
      {
        const { sessionId, status } = data;
        logger.debug("[agent] ACP status update:", { sessionId, status });

        if (sessionId) {
          // Update session acpStatus in repository
          await sessionRepository.update(sessionId, { acpStatus: status });

          // Broadcast to all UI clients for this session
          const statusSubscribers = chatSessions.get(sessionId);
          if (statusSubscribers) {
            const statusMessage: any = {
              type: "acp_status",
              sessionId,
              status,
              timestamp: new Date().toISOString(),
            };

            // Include reset info if present
            if (data.wasReset) {
              statusMessage.wasReset = true;
              statusMessage.resetReason = data.resetReason;
              statusMessage.message = data.message || "Session reset";
            }

            statusSubscribers.forEach((client: WebSocket) => {
              if (client.readyState === 1) {
                client.send(JSON.stringify(statusMessage));
              }
            });
          }
        }
      }
      break;
    case "prompt_received":
      {
        const prSubscribers = chatSessions.get(data.sessionId);
        if (prSubscribers) {
          prSubscribers.forEach((client: WebSocket) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: "prompt_received",
                  sessionId: data.sessionId,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }
      }
      break;
    case "sync_now_result":
      {
        const resolved = resolveAgentSyncNowResult(data);
        if (!resolved) {
          logger.debug(
            "[agent] No pending sync request for result:",
            data.requestId,
          );
        }
      }
      break;
    case "permission_request":
      {
        const { sessionId: permSessionId, requestId, toolCall, options } = data;
        if (!permSessionId || !requestId) break;

        // Store requestId → agentWs so we can route the response back
        pendingPermissions.set(requestId, {
          agentWs: ws,
          sessionId: permSessionId,
        });

        // Broadcast to all chat clients for this session
        const permSubscribers = chatSessions.get(permSessionId);
        if (permSubscribers) {
          permSubscribers.forEach((client: WebSocket) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: "permission_request",
                  requestId,
                  toolCall,
                  options,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }
      }
      break;
    default:
      logger.debug("[agent] Unknown message type:", data.type);
  }
}

// Handle chat messages
async function handleChatMessage(ws, data) {
  const sessionId = ws.data.sessionId;

  switch (data.type) {
    case "send_message":
      // Save user message
      await mimoContext.services.chat.saveMessage(sessionId, {
        role: "user",
        content: data.content,
        timestamp: new Date().toISOString(),
      });

      // Broadcast to all clients in session
      const subscribers = chatSessions.get(sessionId);
      if (subscribers) {
        subscribers.forEach((client) => {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "message",
                role: "user",
                content: data.content,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        });
      }

      // Get session to find assigned agent
      const session = await sessionRepository.findById(sessionId);
      if (session?.assignedAgentId) {
        // Forward to agent if connected
        const ws = agentService.getAgentConnection(session.assignedAgentId);
        if (ws && ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "user_message",
              sessionId: sessionId,
              content: data.content,
            }),
          );
        }
      }
      break;

    case "set_model":
      // Forward model change to agent
      const modelSession = await sessionRepository.findById(sessionId);
      if (modelSession?.assignedAgentId) {
        const agentWs = agentService.getAgentConnection(
          modelSession.assignedAgentId,
        );
        if (agentWs && agentWs.readyState === 1) {
          agentWs.send(
            JSON.stringify({
              type: "set_model",
              sessionId: sessionId,
              modelId: data.modelId,
            }),
          );
        }
      }
      break;

    case "set_mode":
      // Forward mode change to agent
      const modeSession = await sessionRepository.findById(sessionId);
      if (modeSession?.assignedAgentId) {
        const modeAgentWs = agentService.getAgentConnection(
          modeSession.assignedAgentId,
        );
        if (modeAgentWs && modeAgentWs.readyState === 1) {
          modeAgentWs.send(
            JSON.stringify({
              type: "set_mode",
              sessionId: sessionId,
              modeId: data.modeId,
            }),
          );
        }
      }
      break;

    case "request_state":
      // Forward state request to agent
      const stateSession = await sessionRepository.findById(sessionId);
      if (stateSession?.assignedAgentId) {
        const stateAgentWs = agentService.getAgentConnection(
          stateSession.assignedAgentId,
        );
        if (stateAgentWs && stateAgentWs.readyState === 1) {
          stateAgentWs.send(
            JSON.stringify({
              type: "request_state",
              sessionId: sessionId,
            }),
          );
        }
      }
      break;

    case "request_acp_status":
      {
        const reqSessionId = data.sessionId;
        if (!reqSessionId) break;

        // Get session to send current ACP status
        const reqSession = await sessionRepository.findById(reqSessionId);
        if (reqSession) {
          // Send back to requesting client (usually the agent)
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
            stale: mimoContext.services.scc.isStale(
              staleSession.agentWorkspacePath,
            ),
            timestamp: new Date().toISOString(),
          }),
        );
      }
      break;

    case "refresh_impact":
      await handleRefreshImpact({
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
      });
      break;

    case "cancel_request":
      {
        const cancelSessionId = data.sessionId;
        if (!cancelSessionId) {
          logger.debug("No sessionId in cancel_request");
          return;
        }

        // Find assigned agent
        const cancelSession = await sessionRepository.findById(cancelSessionId);
        if (cancelSession?.assignedAgentId) {
          const cancelAgentWs = agentService.getAgentConnection(
            cancelSession.assignedAgentId,
          );
          if (cancelAgentWs && cancelAgentWs.readyState === 1) {
            // Forward cancel request to agent
            cancelAgentWs.send(
              JSON.stringify({
                type: "cancel_request",
                sessionId: cancelSessionId,
                timestamp: new Date().toISOString(),
              }),
            );
            logger.debug(
              `Cancel request forwarded to agent for session ${cancelSessionId}`,
            );
          }
        }

        // Clear buffers for this session
        streamingBuffers.delete(cancelSessionId);
        thoughtBuffers.delete(cancelSessionId);
      }
      break;

    case "clear_session":
      {
        const clearSessionId = data.sessionId;
        if (!clearSessionId) {
          logger.debug("No sessionId in clear_session");
          return;
        }

        logger.debug(`[clear_session] Received for session ${clearSessionId}`);

        // Find assigned agent
        const clearSession = await sessionRepository.findById(clearSessionId);
        if (clearSession?.assignedAgentId) {
          const clearAgentWs = agentService.getAgentConnection(
            clearSession.assignedAgentId,
          );
          if (clearAgentWs && clearAgentWs.readyState === 1) {
            // Forward clear session request to agent
            clearAgentWs.send(
              JSON.stringify({
                type: "clear_session",
                sessionId: clearSessionId,
                timestamp: new Date().toISOString(),
              }),
            );
            logger.debug(
              `Clear session request forwarded to agent for session ${clearSessionId}`,
            );
          } else {
            logger.debug(
              `[clear_session] Agent not connected for session ${clearSessionId}`,
            );
            // Send error back to UI
            const subscribers = chatSessions.get(clearSessionId);
            if (subscribers) {
              subscribers.forEach((client: WebSocket) => {
                if (client.readyState === 1) {
                  client.send(
                    JSON.stringify({
                      type: "clear_session_error",
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
          // Send error back to UI
          const subscribers = chatSessions.get(clearSessionId);
          if (subscribers) {
            subscribers.forEach((client: WebSocket) => {
              if (client.readyState === 1) {
                client.send(
                  JSON.stringify({
                    type: "clear_session_error",
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
      const history = await mimoContext.services.chat.loadHistory(sessionId);
      ws.send(
        JSON.stringify({
          type: "history",
          messages: history,
        }),
      );
      break;

    case "permission_response":
      {
        const { requestId, optionId } = data;
        const pending = pendingPermissions.get(requestId);
        if (!pending) break;

        pendingPermissions.delete(requestId);

        // Route response back to agent
        if (pending.agentWs.readyState === 1) {
          pending.agentWs.send(
            JSON.stringify({
              type: "permission_response",
              requestId,
              outcome: { outcome: "selected", optionId },
            }),
          );
        }

        // Broadcast resolution to all chat clients so other tabs dismiss the card
        const resolveSubscribers = chatSessions.get(pending.sessionId);
        if (resolveSubscribers) {
          resolveSubscribers.forEach((client: WebSocket) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: "permission_resolved",
                  requestId,
                }),
              );
            }
          });
        }
      }
      break;

    default:
      logger.debug("Unknown chat message type:", data.type);
  }
}
