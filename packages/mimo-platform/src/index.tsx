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
} from "./context/mimo-context.js";
import { logger } from "./logger.js";
import { join } from "path";
import { homedir } from "os";
import { createSessionDeletionUseCase } from "./sessions/session-deletion.js";
import { sweepExpiredInactiveSessions } from "./sessions/session-retention-sweeper.js";
import { normalizeAvailableCommands } from "./sessions/available-commands.js";
import { createOS } from "./os/node-adapter.js";
import type { OS } from "./os/types.js";

// Asset embedding support for compiled executable
// @ts-ignore - Module only exists after embedding
import { getEmbeddedAssets, getMimeType, isCompiled } from "./assets.js";

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
const sharedFossilServer = createSharedFossilServer(
  {
    PORT: _port,
    PLATFORM_URL: process.env.PLATFORM_URL ?? `http://localhost:${_port}`,
    JWT_SECRET:
      process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
    MIMO_HOME: mimoHome,
    FOSSIL_REPOS_DIR: fossilReposDir,
    MIMO_SHARED_FOSSIL_SERVER_PORT: process.env.MIMO_SHARED_FOSSIL_SERVER_PORT
      ? parseInt(process.env.MIMO_SHARED_FOSSIL_SERVER_PORT, 10)
      : 8000, // Default port for production
  },
  os,
);

const mimoContext = createMimoContext({
  env: {
    PORT: _port,
    PLATFORM_URL: process.env.PLATFORM_URL ?? `http://localhost:${_port}`,
    JWT_SECRET:
      process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
    MIMO_HOME: mimoHome,
    FOSSIL_REPOS_DIR: fossilReposDir,
    MIMO_SHARED_FOSSIL_SERVER_PORT: process.env.MIMO_SHARED_FOSSIL_SERVER_PORT
      ? parseInt(process.env.MIMO_SHARED_FOSSIL_SERVER_PORT, 10)
      : 8000, // Provide default port for production
  },
  services: {
    sharedFossil: sharedFossilServer,
  },
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
  if (isCompiled()) {
    embeddedAssets = getEmbeddedAssets();
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
const calculatingSessions = new Set<string>();

// Track file watching WebSocket connections per session
const fileWatchSessions = new Map<string, Set<any>>();

// Track streaming message and thought buffers per session
const streamingBuffers = new Map<string, string>();
const thoughtBuffers = new Map<string, string>();
const toolCallBuffers = new Map<string, Map<string, any>>();
const availableCommandsBuffers = new Map<
  string,
  Array<{ name: string; description?: string; template?: string }>
>();
const messageStartTimes = new Map<string, number>();
const autoSyncInFlight = new Set<string>();
const pendingActivityTouches = new Map<string, NodeJS.Timeout>();
const ACTIVITY_TOUCH_DEBOUNCE_MS = 30_000;

// Track pending expert mode instructions
const expertPending = new Map<
  string,
  { chatThreadId: string; originalPath: string }
>();

function streamKey(sessionId: string, chatThreadId?: string): string {
  return `${sessionId}:${chatThreadId || "__no-thread__"}`;
}

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
        const activeStreamKey = streamKey(sessionId, activeThreadId);
        const thoughtContent = thoughtBuffers.get(activeStreamKey);
        const messageContent = streamingBuffers.get(activeStreamKey);

        // Only send streaming state if agent is actually alive
        if (
          (thoughtContent || messageContent) &&
          mimoContext.services.chat.isAgentAlive(sessionId)
        ) {
          ws.send(
            JSON.stringify({
              type: "streaming_state",
              chatThreadId: activeThreadId,
              thoughtContent: thoughtContent || "",
              messageContent: messageContent || "",
              timestamp: new Date().toISOString(),
            }),
          );
        }

        const openCommands =
          availableCommandsBuffers.get(activeStreamKey) ||
          availableCommandsBuffers.get(streamKey(sessionId));
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

const SESSION_ACTIVITY_EVENT_TYPES = new Set([
  "thought_start",
  "thought_chunk",
  "thought_end",
  "message_chunk",
  "usage_update",
]);

function touchSessionActivity(sessionId: string): void {
  if (pendingActivityTouches.has(sessionId)) return;

  const timer = setTimeout(async () => {
    pendingActivityTouches.delete(sessionId);
    try {
      await sessionRepository.touchSessionActivity(sessionId);
    } catch (error) {
      logger.error("[activity] failed to touch session activity", {
        sessionId,
        error,
      });
    }
  }, ACTIVITY_TOUCH_DEBOUNCE_MS);

  pendingActivityTouches.set(sessionId, timer);
}

// Handle agent messages
async function triggerAutoSync(
  sessionId: string,
  reason: "thought_end" | "usage_update" | "expert_diff_ready",
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

  if (
    data.sessionId &&
    typeof data.sessionId === "string" &&
    SESSION_ACTIVITY_EVENT_TYPES.has(data.type)
  ) {
    touchSessionActivity(data.sessionId);
  }

  switch (data.type) {
    case "ping":
      ws.send(JSON.stringify({ type: "pong" }));
      break;
    case "agent_capabilities":
      {
        const capAgentId = ws.data.agentId;
        if (
          capAgentId &&
          data.availableModels &&
          data.availableModes &&
          data.defaultModelId &&
          data.defaultModeId
        ) {
          await agentRepository.updateCapabilities(capAgentId, {
            availableModels: data.availableModels,
            defaultModelId: data.defaultModelId,
            availableModes: data.availableModes,
            defaultModeId: data.defaultModeId,
          });
          logger.debug(
            `[agent] Stored capabilities for agent ${capAgentId}: ${data.defaultModelId} / ${data.defaultModeId}`,
          );
        }
      }
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

      // Find sessions via session-level assignment or thread-level assignment
      const [sessionLevelSessions, threadLevelSessions] = await Promise.all([
        sessionRepository.findByAssignedAgentId(agentId),
        sessionRepository.findByThreadAgentId(agentId),
      ]);
      const seenIds = new Set<string>();
      const sessions = [...sessionLevelSessions, ...threadLevelSessions].filter(
        (s) => {
          if (seenIds.has(s.id)) return false;
          seenIds.add(s.id);
          return true;
        },
      );
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

            if (sessionWithCreds?.mcpToken) {
              mcpServers.push(
                createPlatformMcpServerConfig(
                  PLATFORM_URL,
                  sessionWithCreds.mcpToken,
                ),
              );
            }

            // Build thread bootstrap metadata — only threads assigned to this agent
            const allThreads = sessionWithCreds?.chatThreads ?? [];
            const agentThreads = allThreads.filter(
              (t: any) => t.assignedAgentId === agentId || !t.assignedAgentId,
            );
            const threadBootstrap = agentThreads.map((thread: any) => ({
              chatThreadId: thread.id,
              name: thread.name,
              model: thread.model,
              mode: thread.mode,
              acpSessionId: thread.acpSessionId,
              state: thread.state,
            }));

            sessionsReady.push({
              sessionId,
              name: session.name,
              upstreamPath: session.upstreamPath,
              agentWorkspacePath: session.agentWorkspacePath,
              fossilUrl,
              agentWorkspaceUser: sessionWithCreds?.agentWorkspaceUser,
              agentWorkspacePassword: sessionWithCreds?.agentWorkspacePassword,
              modelState: sessionWithCreds?.modelState ?? null,
              modeState: sessionWithCreds?.modeState ?? null,
              agentSubpath: sessionWithCreds?.agentSubpath ?? null,
              mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
              chatThreads: threadBootstrap,
              activeChatThreadId: sessionWithCreds?.activeChatThreadId ?? null,
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
        const startThreadId = data.chatThreadId;
        if (!startSessionId) {
          logger.debug("No sessionId in thought_start");
          return;
        }

        const startStreamKey = streamKey(startSessionId, startThreadId);

        // Track agent activity so isAgentAlive() stays true between chunk phases
        mimoContext.services.chat.updateAgentActivity(startSessionId);

        // Record message start time for duration tracking
        messageStartTimes.set(startStreamKey, Date.now());

        // Start new thought buffer
        thoughtBuffers.set(startStreamKey, "");

        // Forward to clients
        const subscribers = chatSessions.get(startSessionId);
        if (subscribers) {
          subscribers.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: data.type,
                  chatThreadId: startThreadId,
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
        const chunkThreadId = data.chatThreadId;
        if (!chunkSessionId) {
          logger.debug("No sessionId in thought_chunk");
          return;
        }

        const chunkStreamKey = streamKey(chunkSessionId, chunkThreadId);

        // Track agent activity for health monitoring
        mimoContext.services.chat.updateAgentActivity(chunkSessionId);

        // Accumulate thought chunks
        const currentThoughtBuffer = thoughtBuffers.get(chunkStreamKey) || "";
        thoughtBuffers.set(
          chunkStreamKey,
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
                  chatThreadId: chunkThreadId,
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
        const endThreadId = data.chatThreadId;
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
                  chatThreadId: endThreadId,
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
        const msgThreadId = data.chatThreadId;
        if (!msgSessionId) {
          logger.debug("No sessionId in message_chunk");
          return;
        }

        const msgStreamKey = streamKey(msgSessionId, msgThreadId);

        // Track agent activity for health monitoring
        mimoContext.services.chat.updateAgentActivity(msgSessionId);

        // Fallback: record start time if thought_start never fired
        if (!messageStartTimes.has(msgStreamKey)) {
          messageStartTimes.set(msgStreamKey, Date.now());
        }

        // Accumulate message chunks
        const currentBuffer = streamingBuffers.get(msgStreamKey) || "";
        streamingBuffers.set(
          msgStreamKey,
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
                  chatThreadId: msgThreadId,
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
        const usageThreadId = data.chatThreadId;
        if (!usageSessionId) {
          logger.debug("No sessionId in usage_update");
          return;
        }

        const usageStreamKey = streamKey(usageSessionId, usageThreadId);

        // Compute duration from tracked start time
        const startMs = messageStartTimes.get(usageStreamKey);
        let duration: string | undefined;
        let durationMs: number | undefined;
        if (startMs !== undefined) {
          durationMs = Date.now() - startMs;
          const mins = Math.floor(durationMs / 60000);
          const secs = Math.floor((durationMs % 60000) / 1000);
          duration = `${mins}m${secs}s`;
          messageStartTimes.delete(usageStreamKey);
        }

        // Get accumulated message and thoughts
        const messageContent = streamingBuffers.get(usageStreamKey);
        const thoughtContent = thoughtBuffers.get(usageStreamKey);

        const hasBufferedAssistantOutput = Boolean(
          messageContent || thoughtContent,
        );

        if (hasBufferedAssistantOutput) {
          // Get the active thread ID for this session
          const usageSession = await sessionRepository.findById(usageSessionId);
          const historyThreadId =
            data.chatThreadId || usageSession?.activeChatThreadId;

          // Save assistant response with optional thoughts
          let fullContent = messageContent || "";

          // Prepend thoughts if present
          if (thoughtContent) {
            // Append tool calls inside thought section as structured data
            const toolCallsMap = toolCallBuffers.get(usageStreamKey);
            let toolsData = "";
            if (toolCallsMap && toolCallsMap.size > 0) {
              const tools: any[] = [];
              for (const [, toolCall] of toolCallsMap) {
                tools.push({
                  title: toolCall.toolTitle,
                  kind: toolCall.toolKind,
                  status: toolCall.toolStatus,
                  input: toolCall.toolInput,
                });
              }
              toolsData = "\n<tools>" + JSON.stringify(tools) + "</tools>";
              toolCallBuffers.delete(usageStreamKey);
            }
            fullContent = `<details><summary>Thought Process</summary>${thoughtContent}${toolsData}</details>\n\n${fullContent}`;
            thoughtBuffers.delete(usageStreamKey);
          }

          if (historyThreadId) {
            await mimoContext.services.chat.saveMessage(
              usageSessionId,
              {
                role: "assistant",
                content: fullContent,
                timestamp: new Date().toISOString(),
                ...(duration !== undefined
                  ? { metadata: { duration, durationMs } }
                  : {}),
              },
              historyThreadId,
            );
          }

          // Clear buffer
          streamingBuffers.delete(usageStreamKey);
        }

        // Forward usage update to clients
        const usageSubscribers = chatSessions.get(usageSessionId);
        if (usageSubscribers) {
          usageSubscribers.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: data.type,
                  chatThreadId: usageThreadId,
                  usage: data.usage,
                  timestamp: new Date().toISOString(),
                  ...(duration !== undefined ? { duration, durationMs } : {}),
                }),
              );
            }
          });
        }

        // Check if there's a pending expert instruction for this thread
        const expertKey = streamKey(usageSessionId, usageThreadId);
        const pendingExpert = expertPending.get(expertKey);
        if (pendingExpert) {
          // Notify client that expert response is ready
          const diffSubscribers = chatSessions.get(usageSessionId);
          if (diffSubscribers) {
            diffSubscribers.forEach((client) => {
              if (client.readyState === 1) {
                client.send(
                  JSON.stringify({
                    type: "expert_diff_ready",
                    chatThreadId: usageThreadId,
                    originalPath: pendingExpert.originalPath,
                  }),
                );
              }
            });
          }
          expertPending.delete(expertKey);
        } else {
          void triggerAutoSync(usageSessionId, "usage_update");
        }
      }
      break;

    case "tool_call":
      {
        const toolSessionId = data.sessionId;
        const toolThreadId = data.chatThreadId;
        if (!toolSessionId) {
          logger.debug("No sessionId in tool_call");
          return;
        }

        mimoContext.services.chat.updateAgentActivity(toolSessionId);

        // Track tool call in buffer
        const toolStreamKey = streamKey(toolSessionId, toolThreadId);
        if (!toolCallBuffers.has(toolStreamKey)) {
          toolCallBuffers.set(toolStreamKey, new Map());
        }
        toolCallBuffers.get(toolStreamKey)!.set(data.toolCallId, {
          toolCallId: data.toolCallId,
          toolTitle: data.toolTitle,
          toolKind: data.toolKind,
          toolInput: data.toolInput,
          toolStatus: data.toolStatus,
          timestamp: data.timestamp,
        });

        // Forward to clients
        const toolSubscribers = chatSessions.get(toolSessionId);
        if (toolSubscribers) {
          toolSubscribers.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: data.type,
                  chatThreadId: toolThreadId,
                  toolCallId: data.toolCallId,
                  toolTitle: data.toolTitle,
                  toolKind: data.toolKind,
                  toolInput: data.toolInput,
                  toolStatus: data.toolStatus,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }
      }
      break;

    case "tool_call_update":
      {
        const updateSessionId = data.sessionId;
        const updateThreadId = data.chatThreadId;
        if (!updateSessionId) {
          logger.debug("No sessionId in tool_call_update");
          return;
        }

        mimoContext.services.chat.updateAgentActivity(updateSessionId);

        // Update tool call in buffer
        const updateStreamKey = streamKey(updateSessionId, updateThreadId);
        const toolCallsMap = toolCallBuffers.get(updateStreamKey);
        if (toolCallsMap && toolCallsMap.has(data.toolCallId)) {
          const toolCall = toolCallsMap.get(data.toolCallId)!;
          toolCall.toolStatus = data.toolStatus;
          if (data.toolOutput) {
            toolCall.toolOutput = data.toolOutput;
          }
          toolCall.timestamp = data.timestamp;
        }

        const updateSubscribers = chatSessions.get(updateSessionId);
        if (updateSubscribers) {
          updateSubscribers.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: data.type,
                  chatThreadId: updateThreadId,
                  toolCallId: data.toolCallId,
                  toolStatus: data.toolStatus,
                  toolOutput: data.toolOutput,
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          });
        }
      }
      break;

    case "acp_response":
      // Legacy: Handle simple ACP response and broadcast to chat
      // Agent must specify which session this is for
      const acpSessionId = data.sessionId;
      if (!acpSessionId) {
        logger.debug("No sessionId in acp_response");
        return;
      }

      // Broadcast to all chat clients in session
      const acpSubscribers = chatSessions.get(acpSessionId);
      if (acpSubscribers) {
        acpSubscribers.forEach((client) => {
          if (client.readyState === 1) {
            // WebSocket.OPEN
            client.send(
              JSON.stringify({
                type: "message",
                role: "assistant",
                chatThreadId: data.chatThreadId,
                content: data.content,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        });
      }

      // Get active thread ID and save with thread context
      const acpSessionRecord = await sessionRepository.findById(acpSessionId);
      const acpThreadId =
        data.chatThreadId || acpSessionRecord?.activeChatThreadId;

      if (acpThreadId) {
        await mimoContext.services.chat.saveMessage(
          acpSessionId,
          {
            role: "assistant",
            content: data.content,
            timestamp: new Date().toISOString(),
          },
          acpThreadId,
        );
      }
      break;
    case "available_commands_update": {
      const commandsSessionId = data.sessionId;
      const commandsThreadId = data.chatThreadId;
      if (!commandsSessionId) {
        logger.debug("No sessionId in available_commands_update");
        return;
      }

      const commands = normalizeAvailableCommands(data.commands);
      const commandsStreamKey = streamKey(commandsSessionId, commandsThreadId);
      const existingCommands = availableCommandsBuffers.get(commandsStreamKey);
      if (
        commands.length === 0 &&
        Array.isArray(existingCommands) &&
        existingCommands.length > 0
      ) {
        return;
      }

      availableCommandsBuffers.set(commandsStreamKey, commands);
      if (commands.length > 0) {
        const sessionFallbackKey = streamKey(commandsSessionId);
        availableCommandsBuffers.set(sessionFallbackKey, commands);
      }

      const commandSubscribers = chatSessions.get(commandsSessionId);
      if (commandSubscribers) {
        commandSubscribers.forEach((client) => {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "available_commands_update",
                chatThreadId: commandsThreadId,
                commands,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        });
      }
      break;
    }
    case "file_changed":
      logger.debug("File changed:", data.files);

      const fileSessionId = data.sessionId;
      if (!fileSessionId) {
        logger.debug("No sessionId in file_changed");
        return;
      }

      const fileSession = await sessionRepository.findById(fileSessionId);
      if (!fileSession) {
        logger.debug(`[file_changed] Session not found: ${fileSessionId}`);
        return;
      }

      const fossilUpResult = await mimoContext.services.vcs.fossilUp(
        fileSession.agentWorkspacePath,
      );
      if (!fossilUpResult.success) {
        logger.error(
          `[file_changed] fossil up failed for session ${fileSessionId}: ${fossilUpResult.error || "unknown error"}`,
        );
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
    case "acp_thread_created":
      {
        const { sessionId, acpSessionId, wasReset, resetReason } = data;
        const createdThreadId = data.chatThreadId;
        logger.debug("[agent] ACP session created:", {
          sessionId,
          chatThreadId: createdThreadId,
          acpSessionId,
          wasReset,
          resetReason,
        });

        if (sessionId && acpSessionId && createdThreadId) {
          await sessionRepository.updateChatThread(sessionId, createdThreadId, {
            acpSessionId,
          });
          logger.debug(
            `[agent] Updated thread ${createdThreadId} acpSessionId to ${acpSessionId}`,
          );

          if (wasReset) {
            const timestamp = new Date().toISOString();
            const reasonText = resetReason ? ` (${resetReason})` : "";
            const systemMessage = `Session reset at ${timestamp}${reasonText}`;
            // Get active thread and save system message to current thread
            const resetSession = await sessionRepository.findById(sessionId);
            const resetThreadId =
              createdThreadId || resetSession?.activeChatThreadId;
            if (resetThreadId) {
              await mimoContext.services.chat.saveMessage(
                sessionId,
                {
                  role: "system",
                  content: systemMessage,
                  timestamp,
                },
                resetThreadId,
              );
            }
          }
        }
      }
      break;

    case "acp_thread_cleared":
      {
        const { sessionId, acpSessionId } = data;
        const clearedThreadId = data.chatThreadId;
        logger.debug("[agent] ACP session cleared:", {
          sessionId,
          chatThreadId: clearedThreadId,
          acpSessionId,
        });

        if (sessionId && acpSessionId && clearedThreadId) {
          await sessionRepository.updateChatThread(sessionId, clearedThreadId, {
            acpSessionId,
          });
          logger.debug(
            `[agent] Updated thread ${clearedThreadId} acpSessionId to ${acpSessionId} after clear`,
          );

          // Add system message to chat history
          const timestamp = new Date().toISOString();
          const clearedSession = await sessionRepository.findById(sessionId);
          const historyThreadId =
            clearedThreadId || clearedSession?.activeChatThreadId;
          if (historyThreadId) {
            await mimoContext.services.chat.saveMessage(
              sessionId,
              {
                role: "system",
                content: "Thread context cleared",
                timestamp,
              },
              historyThreadId,
            );
          }

          // Broadcast to all UI clients
          const clearedSubscribers = chatSessions.get(sessionId);
          if (clearedSubscribers) {
            clearedSubscribers.forEach((client: WebSocket) => {
              if (client.readyState === 1) {
                client.send(
                  JSON.stringify({
                    type: "session_cleared",
                    sessionId,
                    chatThreadId: historyThreadId,
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
        const errorThreadId = data.chatThreadId;
        logger.debug("[agent] Clear session error:", {
          sessionId,
          chatThreadId: errorThreadId,
          error,
        });

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
                    chatThreadId: errorThreadId,
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
          // Also update the active thread's model to match the initial value
          const session = await sessionRepository.findById(data.sessionId);
          if (session?.activeChatThreadId) {
            const thread = session.chatThreads.find(
              (t) => t.id === session.activeChatThreadId,
            );
            // Only update if thread has empty model (fresh session initialization)
            if (thread && (!thread.model || thread.model === "")) {
              await sessionRepository.updateChatThread(
                data.sessionId,
                session.activeChatThreadId,
                { model: data.modelState.currentModelId },
              );
              logger.debug(
                `[agent] Updated thread ${session.activeChatThreadId} model to ${data.modelState.currentModelId}`,
              );
            }
          }
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
          // Also update the active thread's mode to match the initial value
          const session = await sessionRepository.findById(data.sessionId);
          if (session?.activeChatThreadId) {
            const thread = session.chatThreads.find(
              (t) => t.id === session.activeChatThreadId,
            );
            // Only update if thread has empty mode (fresh session initialization)
            if (thread && (!thread.mode || thread.mode === "")) {
              await sessionRepository.updateChatThread(
                data.sessionId,
                session.activeChatThreadId,
                { mode: data.modeState.currentModeId },
              );
              logger.debug(
                `[agent] Updated thread ${session.activeChatThreadId} mode to ${data.modeState.currentModeId}`,
              );
            }
          }
        }

        // Re-cache capabilities from session_initialized payload
        const initAgentId = ws.data.agentId;
        if (
          initAgentId &&
          data.modelState?.availableModels &&
          data.modeState?.availableModes
        ) {
          await agentRepository.updateCapabilities(initAgentId, {
            availableModels: data.modelState.availableModels,
            defaultModelId: data.modelState.currentModelId,
            availableModes: data.modeState.availableModes,
            defaultModeId: data.modeState.currentModeId,
          });
        }

        // Broadcast to chat clients
        const initSubscribers = chatSessions.get(data.sessionId);
        if (initSubscribers) {
          const initMessage: any = {
            type: "session_initialized",
            sessionId: data.sessionId,
            chatThreadId: data.chatThreadId,
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
                  chatThreadId: data.chatThreadId,
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
                  chatThreadId: data.chatThreadId,
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
                  chatThreadId: data.chatThreadId,
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

    case "error_response":
      {
        const errorSessionId = data.sessionId;
        const errorThreadId = data.chatThreadId;
        const rawError = data.error;

        // Extract error message from error object
        const errorMessage = rawError?.message || String(rawError);

        if (errorSessionId && errorMessage) {
          const timestamp = new Date().toISOString();
          // Save error as system message in chat history
          const errorSession = await sessionRepository.findById(errorSessionId);
          const historyThreadId =
            errorThreadId || errorSession?.activeChatThreadId;
          if (historyThreadId) {
            await mimoContext.services.chat.saveMessage(
              errorSessionId,
              {
                role: "system",
                content: errorMessage,
                timestamp,
              },
              historyThreadId,
            );
          }
          // Broadcast error to all UI clients
          broadcastToSession(chatSessions, errorSessionId, {
            type: "error",
            chatThreadId: historyThreadId,
            message: errorMessage,
            timestamp,
          });
        }
      }
      break;

    default:
      logger.debug("[agent] Unknown message type:", data.type);
  }
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
      await touchSessionActivity(sessionId);

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

        // Track pending expert instruction for this thread
        expertPending.set(`${sessionId}:${expertThreadId}`, {
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
      const stateStreamKey = streamKey(sessionId, stateThreadId);
      const stateThoughtContent = thoughtBuffers.get(stateStreamKey);
      const stateMessageContent = streamingBuffers.get(stateStreamKey);
      if (
        (stateThoughtContent || stateMessageContent) &&
        mimoContext.services.chat.isAgentAlive(sessionId)
      ) {
        ws.send(
          JSON.stringify({
            type: "streaming_state",
            chatThreadId: stateThreadId,
            thoughtContent: stateThoughtContent || "",
            messageContent: stateMessageContent || "",
            timestamp: new Date().toISOString(),
          }),
        );
      }

      const stateAvailableCommands =
        availableCommandsBuffers.get(stateStreamKey);
      const stateFallbackCommands = availableCommandsBuffers.get(
        streamKey(sessionId),
      );
      const replayCommands = stateAvailableCommands || stateFallbackCommands;
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

        // Find assigned agent
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
            // Forward cancel request to agent
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

        // Clear buffers for this thread
        const cancelStreamKey = streamKey(cancelSessionId, cancelThreadId);
        streamingBuffers.delete(cancelStreamKey);
        thoughtBuffers.delete(cancelStreamKey);

        // Clear any pending expert instruction for this thread
        expertPending.delete(cancelStreamKey);
      }
      break;

    case "cancelled_message":
      {
        // Save cancelled/partial assistant message to history
        const cancelledSessionId = data.sessionId;
        if (!cancelledSessionId) {
          logger.debug("No sessionId in cancelled_message");
          return;
        }

        const cancelledSession =
          await sessionRepository.findById(cancelledSessionId);
        const cancelledThreadId =
          data.chatThreadId || cancelledSession?.activeChatThreadId;

        // Save the cancelled message with metadata indicating it was cancelled
        if (cancelledThreadId) {
          await mimoContext.services.chat.saveMessage(
            cancelledSessionId,
            {
              role: "assistant",
              content: data.content || "",
              timestamp: data.timestamp || new Date().toISOString(),
              metadata: { cancelled: true },
            },
            cancelledThreadId,
          );
          logger.debug(
            `Saved cancelled message for session ${cancelledSessionId}/${cancelledThreadId}`,
          );
        }
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
