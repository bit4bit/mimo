import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createAuthRoutes } from "./auth/routes";
import { createProjectsRoutes } from "./projects/routes";
import { createAgentsRoutes } from "./agents/routes.js";
import { createSessionsRoutes } from "./sessions/routes";
import { createDashboardRoutes } from "./dashboard/routes";
import { createSyncRoutes } from "./sync/routes";
import { createCommitRoutes } from "./commits/routes";
import { createConfigRoutes } from "./config/routes";
import { createCredentialsRoutes } from "./credentials/routes";
import { createMcpServerRoutes } from "./mcp-servers/routes";
import { createSummaryRoutes } from "./summary/routes";
import {
  createAutoCommitRouter,
  resolveAgentSyncNowResult,
  syncSessionViaAssignedAgent,
} from "./auto-commit/routes";
import { LandingPage } from "./components/LandingPage.js";
import { handleRefreshImpact } from "./impact/refresh-handler.js";

import {
  broadcastToSession,
  type SessionWsClient,
} from "./ws/session-broadcast.js";
import { relative } from "path";
import { MimoServer } from "./server/mimo-server.js";
import {
  createMimoContext,
  createSharedFossilServer,
  DEFAULT_MIMO_HOST,
} from "./context/mimo-context.js";
import { logger } from "./logger.js";
import { join } from "path";
import { homedir } from "os";
import { createSessionDeletionUseCase } from "./sessions/session-deletion.js";
import { sweepExpiredInactiveSessions } from "./sessions/session-retention-sweeper.js";
import { normalizeAvailableCommands } from "./sessions/available-commands.js";
import { ChatStreamingPipeline } from "./sessions/streaming-pipeline.js";
import { createOS } from "./os/node-adapter.js";
import type { OS } from "./os/types.js";
import { AgentMessageRouter } from "./agents/message-router.js";

// Asset embedding support for compiled executable
// @ts-ignore - Module only exists after embedding
import { getEmbeddedAssets, getMimeType } from "./assets.js";

const app = new Hono();
const _port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Resolve MIMO_HOME and FOSSIL_REPOS_DIR before creating services
const mimoHome = process.env.MIMO_HOME ?? join(homedir(), ".mimo");
const fossilReposDir =
  process.env.FOSSIL_REPOS_DIR ?? join(mimoHome, "session-fossils");

// Create OS abstraction at the system boundary
const os: OS = createOS({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  ...process.env,
});

// Create shared fossil server explicitly before context (dependency injection)
const _host = process.env.MIMO_HOST ?? DEFAULT_MIMO_HOST;
const sharedFossilServer = createSharedFossilServer(
  {
    PORT: _port,
    PLATFORM_URL: process.env.PLATFORM_URL ?? `http://${_host}:${_port}`,
    JWT_SECRET:
      process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
    MIMO_HOME: mimoHome,
    FOSSIL_REPOS_DIR: fossilReposDir,
    MIMO_SHARED_FOSSIL_SERVER_PORT: process.env.MIMO_SHARED_FOSSIL_SERVER_PORT
      ? parseInt(process.env.MIMO_SHARED_FOSSIL_SERVER_PORT, 10)
      : 8000, // Default port for production
    MIMO_HOST: _host,
  },
  os,
);

const mimoContext = createMimoContext({
  env: {
    PORT: _port,
    PLATFORM_URL: process.env.PLATFORM_URL ?? `http://${_host}:${_port}`,
    JWT_SECRET:
      process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
    MIMO_HOME: mimoHome,
    FOSSIL_REPOS_DIR: fossilReposDir,
    MIMO_SHARED_FOSSIL_SERVER_PORT: process.env.MIMO_SHARED_FOSSIL_SERVER_PORT
      ? parseInt(process.env.MIMO_SHARED_FOSSIL_SERVER_PORT, 10)
      : 8000, // Provide default port for production
    MIMO_HOST: _host,
  },
  services: {
    sharedFossil: sharedFossilServer,
  },
  os,
});

mimoContext.services.scc.configure({ mimoHome });
const agentService = mimoContext.services.agents;
const agentRepository = mimoContext.repos.agents;
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

// Serve static files from public/ (or embedded assets in compiled executable)
let embeddedAssets: Map<string, Blob> | null = null;

try {
  const assets = getEmbeddedAssets();
  if (assets.size > 0) {
    embeddedAssets = assets;
    logger.debug("Using embedded assets for static file serving");
  }
} catch {
  // Not compiled, will use filesystem
  logger.debug("Using filesystem for static file serving");
}

// Serve static files - prefer embedded assets in compiled executable
app.use("/js/*", async (c, next) => {
  if (embeddedAssets) {
    const path = "/js/" + c.req.path.split("/js/")[1];
    const blob = embeddedAssets.get(path);
    if (blob) {
      return new Response(blob, {
        headers: { "Content-Type": getMimeType(path) },
      });
    }
  }
  return serveStatic({ root: "./public" })(c, next);
});

app.use("/vendor/*", async (c, next) => {
  if (embeddedAssets) {
    const path = "/vendor/" + c.req.path.split("/vendor/")[1];
    const blob = embeddedAssets.get(path);
    if (blob) {
      return new Response(blob, {
        headers: { "Content-Type": getMimeType(path) },
      });
    }
  }
  return serveStatic({ root: "./public" })(c, next);
});

import { sessionStateService } from "./sessions/state.js";
import { mcpTokenStore } from "./mcp/token-store.js";
import { createMcpRoutes } from "./mcp/server.js";
import { createPlatformMcpServerConfig } from "./mcp/platform-config.js";
import { registerHelpRoutes } from "./help/routes.js";
import { authMiddleware } from "./auth/middleware.js";

const PUBLIC_PATHS = ["/", "/health", "/api/projects/public", "/api/help"];
const PUBLIC_PATH_PREFIXES = ["/auth/", "/js/", "/vendor/", "/api/mimo-mcp"];

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

app.use("*", async (c, next) => {
  const path = c.req.path;
  if (isPublicPath(path)) {
    return next();
  }
  return authMiddleware(c, next);
});

// Track active chat sessions
const chatSessions = new Map<string, Set<SessionWsClient>>();

// Track file watching WebSocket connections per session
const fileWatchSessions = new Map<string, Set<any>>();

const pipeline = new ChatStreamingPipeline(
  mimoContext.services.chat,
  (sessionId, message) => broadcastToSession(chatSessions, sessionId, message),
);

// Agent message router - handles all agent WebSocket messages
const agentRouter = new AgentMessageRouter({
  pipeline,
  sessionRepository,
  agentRepository,
  agentService,
  chatSessions,
  broadcast: (sessionId, message) =>
    broadcastToSession(chatSessions, sessionId, message),
  triggerAutoSync: async (sessionId, reason) => {
    if (agentRouter["autoSyncInFlight"].has(sessionId)) {
      logger.debug(
        `[auto-commit] Skipping ${reason} sync for ${sessionId} (in-flight)`,
      );
      return;
    }
    agentRouter["autoSyncInFlight"].add(sessionId);
    try {
      const result = await syncSessionViaAssignedAgent(sessionId, {
        autoCommitService: mimoContext.services.autoCommit,
        sessionRepository,
        agentService,
        sccService: mimoContext.services.scc,
        vcs: mimoContext.services.vcs,
        os,
      });
      const subscribers = chatSessions.get(sessionId);
      if (subscribers) {
        subscribers.forEach((client) => {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "sync_status",
                sessionId,
                success: result.success,
                message: result.message,
                error: result.error,
                status: result.syncStatus,
                reason,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        });
      }
    } catch (error) {
      logger.error(`[auto-commit] Failed on ${reason}:`, error);
    } finally {
      agentRouter["autoSyncInFlight"].delete(sessionId);
    }
  },
  sessionStateService,
  chat: mimoContext.services.chat,
  sharedFossilServer,
  mimoContext,
  platformUrl: PLATFORM_URL,
  autoCommitService: mimoContext.services.autoCommit,
  sccService: mimoContext.services.scc,
  vcs: mimoContext.services.vcs,
  os,
});

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
  const user = c.get("user") as { username: string } | undefined;
  if (user) return c.redirect("/dashboard");

  const projects = await mimoContext.repos.projects.listAllPublic();
  const sessions = await mimoContext.repos.sessions.listAll();
  const threadCount = sessions.reduce((n, s) => n + s.chatThreads.length, 0);

  return c.html(
    <LandingPage
      projectCount={projects.length}
      sessionCount={sessions.length}
      threadCount={threadCount}
      isAuthenticated={false}
    />,
  );
});

// Public projects API (no auth required)
app.get("/api/projects/public", async (c) => {
  const publicProjects = await mimoContext.repos.projects.listAllPublic();
  return c.json(publicProjects);
});

// Project routes (protected)
app.route("/projects", createProjectsRoutes(mimoContext));

// Session routes (protected)
app.route("/sessions", createSessionsRoutes(mimoContext));

// Summary API routes
app.route("/api/summary", createSummaryRoutes(mimoContext));

// Test endpoint

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
    vcs: mimoContext.services.vcs,
    os,
  }),
);

// Platform MCP HTTP endpoint (no session auth needed - uses Bearer token)
app.route(
  "/api/mimo-mcp",
  createMcpRoutes({
    chatSessions,
    fileWatchSessions,
    getSessionWorkspace: async (sessionId: string) => {
      const session = await sessionRepository.findById(sessionId);
      return session?.agentWorkspacePath ?? null;
    },
    fileService: mimoContext.services.fileService,
  }),
);

// Help API endpoint (unprotected, read-only)
registerHelpRoutes(app);

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
  host: _host,
  async fetch(req: Request, server: any) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade requests (case-insensitive header check)
    const upgradeHeader =
      req.headers.get("upgrade") || req.headers.get("Upgrade");
    if (upgradeHeader?.toLowerCase() === "websocket") {
      const type = url.pathname.split("/")[2]; // /ws/agent, /ws/chat, or /ws/files

      logger.debug(
        "[WS] Upgrade request for path:",
        url.pathname,
        "type:",
        type,
      );

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

        const payload = await mimoContext.services.auth.verifyToken(token);
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

        logger.debug(
          "[WS] Chat WebSocket: Authenticated upgrade for",
          sessionId,
        );

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
        // File watching WebSocket - requires session authentication
        const sessionId = url.pathname.split("/")[3];
        if (!sessionId) {
          logger.debug("[WS] Files WebSocket: Missing sessionId");
          return new Response("Missing sessionId", { status: 400 });
        }

        // Verify session exists
        const session = await sessionRepository.findById(sessionId);
        if (!session) {
          logger.debug("[WS] Files WebSocket: Session not found", sessionId);
          return new Response("Session not found", { status: 404 });
        }

        // Check authentication from cookie (WebSocket inherits HTTP headers)
        const cookieHeader = req.headers.get("Cookie") || "";
        const usernameMatch = cookieHeader.match(/username=([^;]+)/);
        const username = usernameMatch
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

        logger.debug(
          "[WS] Files WebSocket: Upgrading connection for",
          sessionId,
        );

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
          case "files":
            await handleFilesMessage(ws, data);
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

        // Get active thread ID from session or from URL params
        const sessionRecord = await sessionRepository.findById(sessionId);
        const activeThreadId = sessionRecord?.activeChatThreadId;

        // Send chat history for the active thread
        const history = await mimoContext.services.chat.loadHistory(
          sessionId,
          activeThreadId,
        );
        ws.send(
          JSON.stringify({
            type: "history",
            messages: history,
            chatThreadId: activeThreadId,
          }),
        );

        // Send current streaming state if agent is actively responding and alive
        const openSnap = pipeline.getStreamingSnapshot(
          sessionId,
          activeThreadId,
        );
        if (
          (openSnap.thoughtContent || openSnap.messageContent) &&
          mimoContext.services.chat.isAgentAlive(sessionId)
        ) {
          ws.send(
            JSON.stringify({
              type: "streaming_state",
              chatThreadId: activeThreadId,
              thoughtContent: openSnap.thoughtContent,
              messageContent: openSnap.messageContent,
              timestamp: new Date().toISOString(),
            }),
          );
        }

        const openCommands = pipeline.getAvailableCommands(
          sessionId,
          activeThreadId,
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
        // File watcher connection
        const sessionId = url.pathname.split("/")[3];
        ws.data.connectionType = "files";
        ws.data.sessionId = sessionId;

        // Add to file watch sessions
        if (!fileWatchSessions.has(sessionId)) {
          fileWatchSessions.set(sessionId, new Set());
        }
        fileWatchSessions.get(sessionId).add(ws);

        logger.debug(`File watcher client connected to session ${sessionId}`);
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
            agentRouter.autoRejectPendingPermissionsForSession(sessionId, null);
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
      } else if (connectionType === "files") {
        // Clean up file watches for this connection
        await cleanupFileWatchSession(ws);
        logger.debug(
          `File watcher client disconnected from session ${ws.data.sessionId}`,
        );
      }
    },
  },
});

const server = mimoServer.start();

// Populate MCP token store from all existing sessions
const existingSessions = await sessionRepository.listAll();
mcpTokenStore.populateFromSessions(existingSessions);
logger.debug(
  `[mcp] Populated token store with ${existingSessions.filter((s) => s.mcpToken).length} tokens from ${existingSessions.length} sessions`,
);

const sessionDeletion = createSessionDeletionUseCase({
  sessionRepository,
  sessionStateService,
  fileSyncService: mimoContext.services.fileSync,
  impactCalculator: mimoContext.services.impactCalculator,
  agentService,
  mcpTokenStore,
});

const SESSION_RETENTION_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  void sweepExpiredInactiveSessions({
    sessionRepository,
    sessionDeletion,
  }).then((result) => {
    if (result.deleted > 0) {
      logger.debug("[retention] sweep completed", result);
    }
  });
}, SESSION_RETENTION_SWEEP_INTERVAL_MS);

async function handleAgentMessage(ws, data) {
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

// Handle chat messages
async function handleChatMessage(ws, data) {
  const sessionId = ws.data.sessionId;

  switch (data.type) {
    case "send_message":
      // Route by explicit thread ID when provided
      const userSession = await sessionRepository.findById(sessionId);
      const userThreadId = data.chatThreadId || userSession?.activeChatThreadId;

      if (!userThreadId) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Create a chat thread before sending messages",
          }),
        );
        break;
      }

      // Save user message with thread ID
      await mimoContext.services.chat.saveMessage(
        sessionId,
        {
          role: "user",
          content: data.content,
          timestamp: new Date().toISOString(),
        },
        userThreadId,
      );
      await sessionRepository.touchSessionActivity(sessionId);

      // Broadcast to all clients in session
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

      // Get session to find assigned agent (thread-level first, session-level fallback)
      const sendAgentId = resolveAgentId(userSession, userThreadId);
      if (sendAgentId) {
        const agentWs = agentService.getAgentConnection(sendAgentId);
        if (agentWs && agentWs.readyState === 1) {
          agentWs.send(
            JSON.stringify({
              type: "user_message",
              sessionId: sessionId,
              chatThreadId: userThreadId,
              content: data.content,
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
      // Forward model change to agent
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
      // Forward mode change to agent
      const modeSession = await sessionRepository.findById(sessionId);
      const modeThreadId = data.chatThreadId || modeSession?.activeChatThreadId;
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

    case "request_state":
      // Forward state request to agent with chatThreadId
      const stateSession = await sessionRepository.findById(sessionId);
      const stateThreadId =
        data.chatThreadId || stateSession?.activeChatThreadId;
      const stateAgentId = resolveAgentId(stateSession, stateThreadId);
      if (stateAgentId) {
        const stateAgentWs = agentService.getAgentConnection(stateAgentId);
        if (stateAgentWs && stateAgentWs.readyState === 1) {
          // Include thread model/mode so agent can apply them when spawning ACP
          const stateThread = stateThreadId
            ? stateSession.chatThreads.find((t) => t.id === stateThreadId)
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
            }),
          );
        }
      }

      // Also restore in-progress streaming output for the requested thread.
      // This is needed when switching threads mid-generation.
      const stateSnap = pipeline.getStreamingSnapshot(sessionId, stateThreadId);
      if (
        (stateSnap.thoughtContent || stateSnap.messageContent) &&
        mimoContext.services.chat.isAgentAlive(sessionId)
      ) {
        ws.send(
          JSON.stringify({
            type: "streaming_state",
            chatThreadId: stateThreadId,
            thoughtContent: stateSnap.thoughtContent,
            messageContent: stateSnap.messageContent,
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
          mimoContext.services.impactCalculator.calculateImpact(
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

        const cancelSession = await sessionRepository.findById(cancelSessionId);
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
          const cancelAgentWs = agentService.getAgentConnection(cancelAgentId);
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

        // Persist the server's authoritative buffered partial as a cancelled
        // assistant message. This replaces the older two-message protocol where
        // the client also sent its own copy of the partial content.
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

        // Find assigned agent (thread-level first, session-level fallback)
        const clearAgentId = resolveAgentId(clearSession, clearThreadId);
        if (clearAgentId) {
          const clearAgentWs = agentService.getAgentConnection(clearAgentId);
          if (clearAgentWs && clearAgentWs.readyState === 1) {
            // Forward clear session request to agent
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
            // Send error back to UI
            const subscribers = chatSessions.get(clearSessionId);
            if (subscribers) {
              subscribers.forEach((client: WebSocket) => {
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
          // Send error back to UI
          const subscribers = chatSessions.get(clearSessionId);
          if (subscribers) {
            subscribers.forEach((client: WebSocket) => {
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
      const history = await mimoContext.services.chat.loadHistory(
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

// File watching WebSocket message handler
async function handleFilesMessage(ws: any, data: any) {
  console.log(
    `[WS Files] handleFilesMessage called with:`,
    JSON.stringify(data),
  );
  const sessionId = ws.data.sessionId;
  console.log(`[WS Files] Session ID from ws.data:`, sessionId);
  const fileWatcher = mimoContext.services.fileWatcher;

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
        // Get the session to resolve the full file path
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

        // Resolve full path
        const fullPath = join(session.agentWorkspacePath, filePath);

        // Start watching the file
        logger.debug(
          `[WS Files] Calling watchFile for ${fullPath} with checksum ${currentChecksum}`,
        );
        await fileWatcher.watchFile(
          sessionId,
          fullPath,
          currentChecksum,
          (event) => {
            logger.debug(`[WS Files] File watcher callback triggered:`, event);
            // Send event to ALL active file watcher connections for this session
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
                      path: filePath, // Send relative path to client
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

// Clean up file watching sessions when WebSocket closes
async function cleanupFileWatchSession(ws: any) {
  const sessionId = ws.data?.sessionId;
  if (!sessionId) return;

  const connections = fileWatchSessions.get(sessionId);
  if (connections) {
    connections.delete(ws);
    if (connections.size === 0) {
      // No more connections for this session, but KEEP file watches
      // The client may reconnect and we want to continue watching
      fileWatchSessions.delete(sessionId);
      logger.debug(
        `[FileWatcher] All connections closed for session ${sessionId}, keeping file watches`,
      );
    }
  }
}
