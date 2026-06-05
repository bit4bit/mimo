// SPDX-License-Identifier: AGPL-3.0-only
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { MimoContext } from "../context/mimo-context.js";
import type { OS } from "../os/types.js";
import type { SharedFossilServer } from "../../domain/vcs/shared-fossil-server.js";
import { MimoServer } from "./mimo-server.js";
import { logger } from "../../logger.js";

import { createAuthRoutes } from "../../web/features/auth/pages/auth.js";
import { createProjectsRoutes } from "../../web/features/projects/pages/projects.js";
import { createAgentsRoutes } from "../../web/features/agents/pages/agents.js";
import { createSessionsRoutes } from "../../web/features/sessions/pages/sessions.js";
import { createDashboardRoutes } from "../../web/features/dashboard/pages/dashboard.js";
import { createSyncRoutes } from "../../api/rest/sync.js";
import { createCommitRoutes } from "../../api/rest/commits.js";
import { createConfigRoutes } from "../../web/features/config/pages/config.js";
import { createCredentialsRoutes } from "../../web/features/credentials/pages/credentials.js";
import { createMcpServerRoutes } from "../../web/features/mcp-servers/pages/mcp-servers.js";
import { createSummaryRoutes } from "../../web/features/summary/pages/summary.js";
import {
  createAutoCommitRouter,
  syncSessionViaAssignedAgent,
} from "../../api/rest/auto-commit.js";
import { LandingPage } from "../../web/features/dashboard/components/LandingPage.js";

import {
  broadcastToSession,
  type SessionWsClient,
} from "../../api/websocket/session-broadcast.js";
import { createWebSocketSetup } from "../../api/websocket/handlers.js";
import { createSessionDeletionUseCase } from "../../domain/sessions/session-deletion.js";
import { sweepExpiredInactiveSessions } from "../../domain/sessions/session-retention-sweeper.js";
import { ChatStreamingPipeline } from "../../domain/sessions/streaming-pipeline.js";
import { AgentMessageRouter } from "../../domain/agents/message-router.js";
import { sessionStateService } from "../../domain/sessions/state.js";
import { mcpTokenStore } from "../../mcp/token-store.js";
import { createMcpRoutes } from "../../api/mcp/server.js";
import { registerHelpRoutes } from "../../api/rest/help.js";
import { createAuthMiddleware } from "../../auth/middleware.js";
import { createInternalApiRouter } from "../../api/rest/index.js";

// Asset embedding support for compiled executable
// @ts-ignore - Module only exists after embedding
import { getEmbeddedAssets, getMimeType } from "../../assets.js";

export interface BootstrapDeps {
  mimoContext: MimoContext;
  os: OS;
  sharedFossilServer: SharedFossilServer;
  host: string;
  port: number;
}

const PUBLIC_PATHS = ["/", "/health", "/api/projects/public", "/api/help"];
const PUBLIC_PATH_PREFIXES = [
  "/auth/",
  "/js/",
  "/vendor/",
  "/api/mimo-mcp",
  "/api/internal",
];

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export async function bootstrapMimoServer(deps: BootstrapDeps) {
  const { mimoContext, os, sharedFossilServer, host, port } = deps;
  const PLATFORM_URL = mimoContext.env.PLATFORM_URL;

  const app = new Hono();

  const agentService = mimoContext.services.agents;
  const agentRepository = mimoContext.repos.agents;
  const sessionRepository = mimoContext.repos.sessions;

  // Serve static files from public/ (or embedded assets in compiled executable)
  let embeddedAssets: Map<string, Blob> | null = null;

  try {
    const assets = getEmbeddedAssets();
    if (assets.size > 0) {
      embeddedAssets = assets;
      logger.debug("Using embedded assets for static file serving");
    }
  } catch {
    logger.debug("Using filesystem for static file serving");
  }

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

  // Auth middleware
  app.use("*", async (c, next) => {
    const path = c.req.path;
    if (isPublicPath(path)) {
      return next();
    }
    return createAuthMiddleware(mimoContext.services.auth)(c, next);
  });

  // Shared WebSocket state
  const chatSessions = new Map<string, Set<SessionWsClient>>();
  const fileWatchSessions = new Map<string, Set<any>>();
  const calculatingSessions = new Set<string>();

  const pipeline = new ChatStreamingPipeline(
    mimoContext.services.chat,
    (sessionId, message) =>
      broadcastToSession(chatSessions, sessionId, message),
  );

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
          auth: mimoContext.services.auth,
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

  const wsSetup = createWebSocketSetup({
    sessionRepository,
    agentService,
    agentRouter,
    pipeline,
    chatSessions,
    fileWatchSessions,
    calculatingSessions,
    sccService: mimoContext.services.scc,
    impactCalculator: mimoContext.services.impactCalculator,
    chatService: mimoContext.services.chat,
    fileWatcher: mimoContext.services.fileWatcher,
    fileService: mimoContext.services.fileService,
    authService: mimoContext.services.auth,
  });

  mimoContext.services.fileSync.setImpactStaleHandler((sessionId: string) => {
    void wsSetup.wsHandlers.broadcastImpactStale(sessionId);
  });

  // Auth routes
  app.route("/auth", createAuthRoutes(mimoContext));

  // Dashboard (protected)
  app.route("/dashboard", createDashboardRoutes(mimoContext));

  // Landing page (public)
  app.get("/", async (c) => {
    const user = (c as any).get("user") as { username: string } | undefined;
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
  app.route(
    "/sessions",
    createSessionsRoutes(mimoContext, {
      impactBackground: {
        calculatingSessions,
        broadcast: (sessionId, message) =>
          broadcastToSession(chatSessions, sessionId, message),
      },
    }),
  );

  // Summary API routes
  app.route("/api/summary", createSummaryRoutes(mimoContext));

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
      auth: mimoContext.services.auth,
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

  // Internal API routes (protected by JWT Bearer token)
  app.route("/api/internal", createInternalApiRouter(mimoContext));

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

  const mimoServer = new MimoServer({
    serve: (config) => Bun.serve(config as any) as any,
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    ensureSharedFossilRunning: () => sharedFossilServer.ensureRunning(),
    getSharedFossilPort: () => sharedFossilServer.getPort(),
    logger: console,
  });

  mimoServer.setup({
    host,
    async fetch(req: Request, server: any) {
      const upgradeHeader =
        req.headers.get("upgrade") || req.headers.get("Upgrade");
      if (upgradeHeader?.toLowerCase() === "websocket") {
        return await wsSetup.handleUpgrade(req, server);
      }
      return app.fetch(req);
    },
    port,
    websocket: wsSetup.websocket,
  });

  const server = mimoServer.start();

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

  return { server, app };
}
