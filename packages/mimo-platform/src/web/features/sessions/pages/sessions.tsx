// SPDX-License-Identifier: AGPL-3.0-only
/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import crypto from "crypto";
import { SessionDetailPage } from "../components/SessionDetailPage.js";
import { SessionCreatePage } from "../components/SessionCreatePage.js";
import { Layout } from "../../../shared/components/Layout.js";
import type { Context } from "hono";
import {
  normalizeFrameState,
  updateFrameState,
} from "../../../../domain/sessions/frame-state.js";
import { logger } from "../../../../logger.js";
import type { MimoContext } from "../../../../infrastructure/context/mimo-context.js";
import { findFiles } from "../../../../domain/files/service.js";
import type {
  FileInfo,
} from "../../../../domain/files/types.js";
import {
  detectLanguage,
  escapeHtml,
} from "../../../../domain/files/syntax-highlighter.js";
import { SearchServiceError } from "../../../../domain/files/search-service.js";
import { canDeleteSessionNow } from "../../../../domain/sessions/session-retention.js";
import { createSessionDeletionUseCase } from "../../../../domain/sessions/session-deletion.js";
import { isExcluded } from "../../../../domain/files/path-policy.js";
import { mcpTokenStore } from "../../../../mcp/token-store.js";
import { createPlatformMcpServerConfig } from "../../../../mcp/platform-config.js";
import { DEFAULT_MIMO_HOST } from "../../../../infrastructure/context/mimo-context.js";
import { handleRefreshImpact } from "../../../../domain/impact/refresh-handler.js";
import { createInternalApiClient } from "../../../../api/rest/index.js";
import type {
  GetSessionDetailsResponse,
  GetChatHistoryResponse,
  ListSessionsResponse,
  GetSessionResponse,
  CreateSessionResponse,
  UpdateSessionResponse,
  SessionResponse,
} from "../../../../api/rest/sessions/types.js";
import type {
  ListMcpServersResponse,
  GetMcpServerResponse,
} from "../../../../api/rest/mcp-servers/types.js";
import type { GetAgentResponse } from "../../../../api/rest/agents/types.js";
import type { GetConfigResponse } from "../../../../api/rest/config/types.js";
import type { SaveMessageResponse } from "../../../../api/rest/chat/types.js";

type SessionsRoutesContext = Pick<MimoContext, "services" | "repos" | "env">;

interface ImpactBackgroundDeps {
  calculatingSessions: Set<string>;
  broadcast: (sessionId: string, message: Record<string, unknown>) => void;
}

interface SessionsRoutesDeps {
  impactBackground?: ImpactBackgroundDeps;
  /** Optional custom fetch function for testing (routes to internal API) */
  fetchFn?: typeof fetch;
}

export function createSessionsRoutes(
  mimoContext: SessionsRoutesContext,
  deps: SessionsRoutesDeps = {},
) {
  const router = new Hono();
  const authService = mimoContext.services.auth;
  const agentService = mimoContext.services.agents;
  const chatService = mimoContext.services.chat;
  const configService = mimoContext.services.config;
  const mcpServerService = mimoContext.services.mcpServer;
  const projectRepository = mimoContext.repos.projects;
  const sessionRepository = mimoContext.repos.sessions;
  const agentRepository = mimoContext.repos.agents;
  const frameStateService = mimoContext.services.frameState;
  const sessionStateService = mimoContext.services.sessionState;
  const sharedFossilServer = mimoContext.services.sharedFossil;
  const vcs = mimoContext.services.vcs;
  const projectVcsCache = mimoContext.services.projectVcsCache;
  const platformUrl =
    mimoContext.env?.PLATFORM_URL ??
    `http://${mimoContext.env?.MIMO_HOST ?? DEFAULT_MIMO_HOST}:3000`;

  function getBrowserFossilUrl(sessionId: string): string {
    const fossilUrl = sharedFossilServer.getUrl(sessionId);
    try {
      const fossil = new URL(fossilUrl);
      const platform = new URL(platformUrl);
      fossil.hostname = platform.hostname;
      return fossil.toString();
    } catch {
      return fossilUrl;
    }
  }
  const fileService = mimoContext.services.fileService;
  const searchService = mimoContext.services.search;
  const expertService = mimoContext.services.expert;
  const sessionDeletion = createSessionDeletionUseCase({
    sessionRepository,
    sessionStateService,
    fileSyncService: mimoContext.services.fileSync,
    impactCalculator: mimoContext.services.impactCalculator,
    agentService,
    mcpTokenStore,
  });

  // Helper to create API client with optional test fetch
  function createApiClient(c: Context) {
    return createInternalApiClient(c, mimoContext as MimoContext, {
      fetchFn: deps.fetchFn,
    });
  }

  // Helper to get authenticated username from cookie
  async function getAuthUsername(c: Context): Promise<string | null> {
    const cookieHeader = c.req.header("Cookie");
    const usernameMatch = cookieHeader?.match(/username=([^;]+)/);
    const username = usernameMatch ? usernameMatch[1] : null;
    if (username) return username;

    // Also check JWT token
    const tokenMatch = cookieHeader?.match(/token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (token) {
      const payload = await authService.verifyToken(token);
      if (payload) return payload.username;
    }

    return null;
  }

  // Helper to get projectId from either URL param or query param
  function getProjectId(c: Context): string | null {
    // Try URL param first (for nested routes)
    const projectId = c.req.param("projectId");
    if (projectId) return projectId;

    // Fall back to query param (for flat routes)
    return c.req.query("projectId");
  }

  function buildAuthenticatedUrl(
    baseUrl: string,
    username: string,
    password: string,
  ): string {
    const url = new URL(baseUrl);
    url.username = username;
    url.password = password;
    return url.toString();
  }

  function sanitizeSessionNameForWorkdir(name: string): string {
    return name.replace(/[\\/]/g, "-");
  }

  function shellDoubleQuote(value: string): string {
    const escaped = value.replace(/[\\"$`]/g, "\\$&");
    return `"${escaped}"`;
  }

  // GET /sessions or /projects/:projectId/sessions - List sessions
  // Proxies to internal API for data, handles rendering
  router.get("/", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const projectId = getProjectId(c);

    // Scoped to a single project (used by /projects/:id/sessions)
    if (projectId) {
      // Verify project exists via projects repository
      const project = await projectRepository.findById(projectId);
      if (!project || project.owner !== username) {
        return c.text("Project not found", 404);
      }

      return c.redirect(`/projects?selected=${project.id}`, 302);
    }

    return c.redirect("/projects", 302);
  });

  // GET /sessions/new or /projects/:projectId/sessions/new - Create session form
  router.get("/new", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const projectId = getProjectId(c);
    if (!projectId) {
      return c.text("Project ID required", 400);
    }

    const project = await projectRepository.findById(projectId);
    if (!project || project.owner !== username) {
      return c.text("Project not found", 404);
    }

    // Get MCP servers via Internal API Client
    const apiClient = createApiClient(c);
    const mcpResult =
      await apiClient.get<ListMcpServersResponse>("/mcp-servers");

    let mcpServers: any[] = [];
    if (mcpResult.success) {
      mcpServers = mcpResult.data.servers;
    }

    return c.html(
      <SessionCreatePage project={project} mcpServers={mcpServers} />,
    );
  });

  // POST /sessions or /projects/:projectId/sessions - Create new session
  router.post("/", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const body = await c.req.parseBody({ all: true });
    const name = body.name as string;
    const projectId = (body.projectId as string) || getProjectId(c);
    const agentSubpathRaw = (body.agentSubpath as string) || null;
    const branchName = (body.branchName as string) || null;
    const sessionTtlDaysRaw = (body.sessionTtlDays as string) || "180";
    const sessionTtlDays = parseInt(sessionTtlDaysRaw, 10);
    const idleTimeoutMsRaw = (body.idleTimeoutMs as string) || "600000";
    const idleTimeoutMs = parseInt(idleTimeoutMsRaw, 10);
    const branchModeRaw = (body.branchMode as string) || "new";
    const branchMode: "new" | "sync" =
      branchModeRaw === "sync" ? "sync" : "new";
    const priorityRaw = (body.priority as string) || undefined;
    const instructions = (body.instructions as string) || undefined;
    const clonePortRaw = (body.clonePort as string) || null;
    let clonePort: number | undefined;
    if (clonePortRaw) {
      const parsed = parseInt(clonePortRaw, 10);
      if (
        isNaN(parsed) ||
        !Number.isInteger(parsed) ||
        parsed < 1 ||
        parsed > 65535
      ) {
        return c.text("SSH port must be an integer between 1 and 65535", 400);
      }
      clonePort = parsed;
    }
    if (
      priorityRaw !== undefined &&
      !["high", "medium", "low"].includes(priorityRaw)
    ) {
      return c.text("priority must be one of: high, medium, low", 400);
    }
    const priority = priorityRaw as "high" | "medium" | "low" | undefined;

    // Parse MCP server IDs from form (can be single string or array)
    let mcpServerIds: string[] = [];
    if (body.mcpServerIds) {
      if (Array.isArray(body.mcpServerIds)) {
        mcpServerIds = body.mcpServerIds as string[];
      } else {
        mcpServerIds = [body.mcpServerIds as string];
      }
    }

    if (!name || !projectId) {
      return c.text("Name and project ID required", 400);
    }

    if (
      isNaN(sessionTtlDays) ||
      !Number.isInteger(sessionTtlDays) ||
      sessionTtlDays < 1
    ) {
      return c.text("sessionTtlDays must be an integer >= 1", 400);
    }

    if (
      isNaN(idleTimeoutMs) ||
      (idleTimeoutMs !== 0 && idleTimeoutMs < 10000)
    ) {
      return c.text(
        "idleTimeoutMs must be at least 10000ms or 0 to disable",
        400,
      );
    }

    const project = await projectRepository.findById(projectId);
    if (!project || project.owner !== username) {
      return c.text("Project not found", 404);
    }

    let projectCredential:
      | import("../../../../domain/credentials/repository.js").Credential
      | undefined;
    if (project.credentialId) {
      projectCredential = await mimoContext.repos.credentials.findById(
        project.credentialId,
        username,
      );
      if (!projectCredential) {
        return c.text(
          "Project credential not found. Update project credentials and try again.",
          400,
        );
      }
    }

    const effectiveSubpath =
      (agentSubpathRaw?.trim() || undefined) ??
      project.agentSubpath ??
      undefined;

    if (branchMode === "sync" && !branchName) {
      return c.text(
        "Branch name is required when syncing an existing branch",
        400,
      );
    }
    if (branchMode === "sync" && project.repoType !== "git") {
      return c.text("Sync mode is only supported for git repositories", 400);
    }

    // Validate MCP server IDs if provided via Internal API Client
    const apiClient = createApiClient(c);

    if (mcpServerIds.length > 0) {
      try {
        // Check all MCP servers exist
        for (const id of mcpServerIds) {
          const serverResult = await apiClient.get<GetMcpServerResponse>(
            `/mcp-servers/${id}`,
          );
          if (!serverResult.success) {
            return c.text(`MCP server '${id}' not found`, 400);
          }
        }

        // Check for duplicate MCP server names via Internal API Client
        const dupResult = await apiClient.post<{
          duplicateName: string | null;
        }>("/mcp-servers/validate-duplicates", { ids: mcpServerIds });

        if (dupResult.success && dupResult.data.duplicateName) {
          return c.text(
            `Duplicate MCP server name '${dupResult.data.duplicateName}' in selection`,
            400,
          );
        }
      } catch (error: any) {
        return c.text(`MCP server validation error: ${error.message}`, 500);
      }
    }

    // Create session via Internal API Client
    const createResult = await apiClient.post<CreateSessionResponse>(
      "/sessions",
      {
        name,
        projectId,
        agentSubpath: effectiveSubpath,
        branchName,
        mcpServerIds: mcpServerIds.length > 0 ? mcpServerIds : undefined,
        sessionTtlDays,
        idleTimeoutMs,
        priority,
        instructions,
        ...(clonePort != null && { clonePort }),
      },
    );

    if (!createResult.success) {
      return c.text(`Error: ${createResult.error}`, createResult.status);
    }
    const session = createResult.data.session;

    // Get full session details for VCS operations
    const getSessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${session.id}`,
    );

    if (!getSessionResult.success) {
      return c.text("Failed to retrieve created session", 500);
    }
    const fullSession = getSessionResult.data.session;

    // Initialize repository: clone → import to fossil
    // Note: checkout is created by agent when it receives session_ready
    try {
      // Step 1: Clone repository to upstream/
      // In sync mode, clone the existing remote branch directly; otherwise use
      // the project's configured sourceBranch.
      const cloneBranch =
        branchMode === "sync" ? branchName! : project.sourceBranch;
      const effectiveClonePort = clonePort ?? project.clonePort;
      const cloneResult = await projectVcsCache.clone({
        projectId: project.id,
        repoUrl: project.repoUrl,
        repoType: project.repoType,
        targetPath: session.upstreamPath,
        credential: projectCredential,
        branch: cloneBranch,
        ...(effectiveClonePort != null && { clonePort: effectiveClonePort }),
      });

      if (!cloneResult.success) {
        // Cleanup: delete session via Internal API Client
        await apiClient.delete(`/sessions/${session.id}`);
        return c.text(`Failed to clone repository: ${cloneResult.error}`, 500);
      }

      // Step 2: Resolve the desired branch and align upstream.
      // The branch session is only for upstream; fossil import always lands
      // on trunk so that agent-workspace and mimo-agent checkout work with a
      // clean main branch.
      let desiredBranch: string | null;
      if (branchMode === "sync") {
        // clone --branch should have left upstream HEAD on branchName.
        // Verify before persisting so we never record a branch that doesn't
        // match the working tree (which would later cause a new branch to be
        // created on push).
        const headResult = await vcs.getCurrentBranch(
          project.repoType,
          session.upstreamPath,
        );
        if (!headResult.success || headResult.branch !== branchName) {
          await apiClient.delete(`/sessions/${session.id}`);
          return c.text(
            `Sync failed: expected branch '${branchName}' but checkout is on '${headResult.branch ?? "unknown"}'. Verify the branch exists on the remote.`,
            500,
          );
        }
        desiredBranch = branchName!;
      } else {
        desiredBranch = branchName || project.newBranch || null;
        if (desiredBranch) {
          const branchResult = await vcs.createBranch(
            desiredBranch,
            project.repoType,
            session.upstreamPath,
          );
          if (!branchResult.success) {
            await apiClient.delete(`/sessions/${session.id}`);
            return c.text(
              `Failed to create branch '${desiredBranch}': ${branchResult.error}`,
              500,
            );
          }
        }
      }

      // Step 3: Import to fossil proxy (repo.fossil) on trunk.
      // The branch session is only for upstream; agent-workspace and
      // mimo-agent checkout should work with a clean trunk.
      const fossilPath = sessionRepository.getFossilPath(session.id);
      const importResult = await vcs.importToFossil(
        session.upstreamPath,
        project.repoType,
        fossilPath,
      );

      if (!importResult.success) {
        await apiClient.delete(`/sessions/${session.id}`);
        return c.text(`Failed to import to fossil: ${importResult.error}`, 500);
      }

      // Set fossil project name to session name (non-fatal)
      const nameResult = await vcs.setFossilProjectName(
        fossilPath,
        session.name,
      );
      if (!nameResult.success) {
        logger.warn(
          "[session] Failed to set fossil project name:",
          nameResult.error,
        );
      }

      if (desiredBranch) {
        await apiClient.put(`/sessions/${session.id}`, {
          branch: desiredBranch,
        });
      }

      // Step 4: Create fossil user for agent access
      const agentWorkspaceUser = "dev";
      const agentWorkspacePassword = crypto
        .randomUUID()
        .replace(/-/g, "")
        .slice(0, 16);
      const userResult = await vcs.createFossilUser(
        fossilPath,
        agentWorkspaceUser,
        agentWorkspacePassword,
        "s",
      );

      if (!userResult.success) {
        logger.error(
          "[session] Failed to create fossil user:",
          userResult.error,
        );
        await apiClient.delete(`/sessions/${session.id}`);
        return c.text("Failed to create session workspace user", 500);
      }

      // Save credentials to session via Internal API Client
      await apiClient.put(`/sessions/${session.id}`, {
        agentWorkspaceUser,
        agentWorkspacePassword,
      });

      // Step 5: Open fossil checkout in agent-workspace on trunk.
      // The branch session is only for upstream; agent-workspace should work
      // with a clean trunk.
      const openResult = await vcs.openFossil(
        fossilPath,
        session.agentWorkspacePath,
      );
      if (!openResult.success) {
        logger.error(
          "[session] Failed to open fossil in agent-workspace:",
          openResult.error,
        );
        await apiClient.delete(`/sessions/${session.id}`);
        return c.text("Failed to open fossil checkout", 500);
      }

      // Step 5.5: Sync .gitignore and .mimoignore to .fossil-settings/ignore-glob in agent-workspace
      const ignoreResult = await vcs.syncIgnoresToFossil(
        session.upstreamPath,
        session.agentWorkspacePath,
      );
      if (!ignoreResult.success) {
        logger.warn(
          "[session] Failed to sync .gitignore to fossil ignore-glob:",
          ignoreResult.error,
        );
        // Non-fatal: continue session creation
      }

      // Step 6: Resolve MCP servers if attached via Internal API Client
      let mcpServers: any[] = [];
      if (mcpServerIds.length > 0) {
        try {
          const resolveResult = await apiClient.post<{ servers: any[] }>(
            "/mcp-servers/resolve",
            { ids: mcpServerIds },
          );
          if (resolveResult.success) {
            mcpServers = resolveResult.data.servers;
          }
        } catch (error) {
          logger.error(
            `[session] Failed to resolve MCP servers for session ${session.id}:`,
            error,
          );
          // Continue without MCP servers - agent will work without them
        }
      }
    } catch (error) {
      logger.error("Failed to setup session:", error);
      await apiClient.delete(`/sessions/${session.id}`);
      return c.text("Failed to setup session repository", 500);
    }

    return c.redirect(`/projects/${projectId}/sessions/${session.id}`);
  });

  // GET /sessions/search - Search sessions across all projects
  router.get("/search", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const q = c.req.query("q") ?? "";

    // List all sessions via Internal API Client
    const apiClient = createApiClient(c);
    const listResult = await apiClient.get<ListSessionsResponse>("/sessions");

    if (!listResult.success) {
      return c.json(
        { error: `Failed to list sessions: ${listResult.error}` },
        listResult.status,
      );
    }

    const allSessions = listResult.data.sessions;
    const ownerSessions = allSessions.filter((s) => s.owner === username);

    // Load project names for each session
    const projectMap = new Map<string, string>();
    const results: Array<{
      sessionId: string;
      sessionName: string;
      projectId: string;
      projectName: string;
      status: string;
    }> = [];

    for (const session of ownerSessions) {
      let projectName = projectMap.get(session.projectId);
      if (!projectName) {
        const project = await projectRepository.findById(session.projectId);
        projectName = project?.name ?? "Unknown Project";
        projectMap.set(session.projectId, projectName);
      }

      if (q) {
        const lowerQ = q.toLowerCase();
        const matchSessionName = session.name.toLowerCase().includes(lowerQ);
        const matchProjectName = projectName.toLowerCase().includes(lowerQ);
        if (!matchSessionName && !matchProjectName) continue;
      }

      results.push({
        sessionId: session.id,
        sessionName: session.name,
        projectId: session.projectId,
        projectName,
        status: session.status,
      });
    }

    if (!q) {
      // Sort by lastActivityAt descending, fallback to createdAt
      results.sort((a, b) => {
        const sessionA = ownerSessions.find((s) => s.id === a.sessionId);
        const sessionB = ownerSessions.find((s) => s.id === b.sessionId);
        const dateA = sessionA?.lastActivityAt ?? sessionA?.createdAt;
        const dateB = sessionB?.lastActivityAt ?? sessionB?.createdAt;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    }

    return c.json(results.slice(0, 10));
  });

  // GET /sessions/:id or /projects/:projectId/sessions/:id - View session detail
  // Proxies to internal API for session data
  router.get("/:id", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");

    const apiClient = createApiClient(c);

    try {
      // Call internal API for session details
      const detailsResult = await apiClient.get<GetSessionDetailsResponse>(
        `/sessions/${sessionId}/details`,
      );

      if (!detailsResult.success) {
        return c.text(
          detailsResult.error || "Session not found",
          detailsResult.status === 404 ? 404 : 500,
        );
      }

      const details = detailsResult.data;
      const session = details.session;

      if (!session) {
        return c.text("Session not found", 404);
      }

      const project = details.project;
      if (!project) {
        return c.text("Project not found", 404);
      }

      // Get chat history from internal API
      const chatResult = await apiClient.get<GetChatHistoryResponse>(
        `/sessions/${sessionId}/chat`,
      );

      let chatHistory: unknown[] = [];
      if (chatResult.success) {
        chatHistory = chatResult.data.messages;
      }

      // Get assigned agent if any via Internal API Client
      let agent = undefined;
      if (session.assignedAgentId) {
        const agentResult = await apiClient.get<GetAgentResponse>(
          `/agents/${session.assignedAgentId}`,
        );
        if (agentResult.success) {
          agent = agentResult.data.agent;
        }
      }

      // Get model/mode state from in-memory store, fallback to persisted session data
      // We already have the session from the details API above, use that for modelState/modeState
      const modelState =
        sessionStateService.getModelState(sessionId) ?? session.modelState;
      const modeState =
        sessionStateService.getModeState(sessionId) ?? session.modeState;

      // Always generate fossil URL - the shared server should be running
      // If it's not running yet, the URL will still be valid but the server won't respond
      const fossilUrl = getBrowserFossilUrl(sessionId);
      const cloneWorkspaceCommand =
        session.agentWorkspaceUser && session.agentWorkspacePassword
          ? `fossil open ${shellDoubleQuote(buildAuthenticatedUrl(fossilUrl, session.agentWorkspaceUser, session.agentWorkspacePassword))} --workdir ${shellDoubleQuote(sanitizeSessionNameForWorkdir(session.name))} --repodir ${shellDoubleQuote(sanitizeSessionNameForWorkdir(session.name))}`
          : null;

      // Resolve attached MCP servers for display via Internal API Client
      const mcpServers: any[] = [];
      if (session.mcpServerIds && session.mcpServerIds.length > 0) {
        const mcpServersResult =
          await apiClient.get<ListMcpServersResponse>("/mcp-servers");
        if (mcpServersResult.success) {
          for (const id of session.mcpServerIds) {
            const server = mcpServersResult.data.servers.find(
              (s) => s.id === id,
            );
            if (server) {
              mcpServers.push(server);
            }
          }
        }
      }

      // Load config via Internal API Client
      const configResult = await apiClient.get<GetConfigResponse>("/config");

      let loadedConfig: GetConfigResponse["config"] = {
        streamingTimeoutMs: 30000,
        sessionKeybindings: [],
        globalKeybindings: [],
        chatFileExtensions: [],
      };
      if (configResult.success) {
        loadedConfig = configResult.data.config;
      }
      const streamingTimeoutMs = loadedConfig.streamingTimeoutMs;
      const sessionKeybindings = loadedConfig.sessionKeybindings;
      const globalKeybindings = loadedConfig.globalKeybindings;
      const chatFileExtensions = loadedConfig.chatFileExtensions;
      const canDelete = canDeleteSessionNow(session);

      return c.html(
        <SessionDetailPage
          session={session}
          project={project}
          chatHistory={chatHistory}
          frameState={normalizeFrameState(session.frameState)}
          notesContent={frameStateService.loadNotes(session.id)}
          projectId={session.projectId}
          projectNotesContent={frameStateService.loadProjectNotes(
            session.projectId,
          )}
          agent={agent}
          modelState={modelState}
          modeState={modeState}
          fossilUrl={fossilUrl}
          cloneWorkspaceCommand={cloneWorkspaceCommand ?? undefined}
          acpStatus={session.acpStatus}
          mcpServers={mcpServers}
          streamingTimeoutMs={streamingTimeoutMs}
          sessionKeybindings={sessionKeybindings}
          globalKeybindings={globalKeybindings}
          chatFileExtensions={chatFileExtensions}
          chatThreads={session.chatThreads}
          activeChatThreadId={session.activeChatThreadId}
          agentWorkspacePath={session.agentWorkspacePath}
          canDelete={canDelete}
          backUrl={`/projects?selected=${session.projectId}`}
        />,
      );
    } catch (error) {
      logger.error("[sessions] Error loading session:", error);
      return c.text("Error loading session", 500);
    }
  });

  // GET /sessions/:id/frame-state - Fetch frame state
  router.get("/:id/frame-state", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json(normalizeFrameState(session.frameState));
  });

  // POST /sessions/:id/frame-state - Update frame state
  router.post("/:id/frame-state", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.json({ error: "Session not found" }, 404);
    }

    const body = await c.req.json();
    const frame = body.frame as "left" | "right";
    const activeBufferId =
      typeof body.activeBufferId === "string" ? body.activeBufferId : undefined;
    const isCollapsed =
      typeof body.isCollapsed === "boolean" ? body.isCollapsed : undefined;

    if (frame !== "left" && frame !== "right") {
      return c.json({ error: "Invalid frame-state payload" }, 400);
    }

    if (frame === "left" && !activeBufferId) {
      return c.json({ error: "Invalid frame-state payload" }, 400);
    }

    if (
      frame === "right" &&
      !activeBufferId &&
      typeof isCollapsed !== "boolean"
    ) {
      return c.json({ error: "Invalid frame-state payload" }, 400);
    }

    const nextState = updateFrameState(session.frameState, frame, {
      activeBufferId,
      isCollapsed,
    });

    // Update session via Internal API Client
    const updateResult = await apiClient.put<SessionResponse>(
      `/sessions/${sessionId}`,
      {
        frameState: nextState,
      },
    );

    if (!updateResult.success) {
      return c.json(
        { error: `Failed to update session: ${updateResult.error}` },
        updateResult.status,
      );
    }

    return c.json(nextState);
  });

  // GET /sessions/:id/notes - Fetch notes content
  router.get("/:id/notes", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({ content: frameStateService.loadNotes(sessionId) });
  });

  // POST /sessions/:id/notes - Save notes content
  router.post("/:id/notes", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.json({ error: "Session not found" }, 404);
    }

    const body = await c.req.json();
    const content = typeof body.content === "string" ? body.content : "";
    frameStateService.saveNotes(sessionId, content);

    return c.json({ success: true });
  });

  // POST /sessions/:id/cancel - Cancel current ACP request
  router.post("/:id/cancel", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.text(
        "Session not found",
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    const cancelled = await agentService.cancelCurrentRequest(sessionId);

    return c.json({ success: cancelled });
  });

  // GET /sessions/:id/close - Render close session form
  router.get("/:id/close", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.text(
        "Session not found",
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    const referer =
      c.req.header("Referer") ||
      `/projects/${session.projectId}/sessions/${sessionId}`;

    return c.html(
      <Layout title={`Close Session - ${session.name}`}>
        <div class="container">
          <h1>Close Session</h1>
          <p>
            You are about to close <strong>{session.name}</strong>. Once closed,
            the session will become read-only.
          </p>
          <form
            method="POST"
            action={`/sessions/${sessionId}/close`}
            class="mt-20"
          >
            <div class="mb-16">
              <fieldset
                style="border:1px solid #444;border-radius:4px;padding:12px 16px;margin:0"
              >
                <legend class="label-strong">Reason for closing</legend>
                <div style="margin:6px 0"><label><input type="radio" name="reason" value="implemented" /> implemented</label></div>
                <div style="margin:6px 0"><label><input type="radio" name="reason" value="invalid expectations" /> invalid expectations</label></div>
                <div style="margin:6px 0"><label><input type="radio" name="reason" value="wrong implementation" /> wrong implementation</label></div>
                <div style="margin:6px 0"><label><input type="radio" name="reason" value="no reason" checked={true} /> no reason</label></div>
              </fieldset>
            </div>
            <div class="mb-16">
              <label for="note" class="label-strong">
                Note (optional — overrides reason above)
              </label>
              <textarea
                id="note"
                name="note"
                rows={3}
                class="textarea-dark"
                placeholder="Add details..."
              />
            </div>
            <div class="actions-row">
              <button type="submit" class="btn-secondary">
                Close Session
              </button>
              <a href={referer} class="btn-secondary link-no-underline">
                Cancel
              </a>
            </div>
          </form>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                document.addEventListener('keydown', function(e) {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    document.querySelector('form').submit();
                  }
                });
              `,
            }}
          />
        </div>
      </Layout>,
    );
  });

  // POST /sessions/:id/close - Close session (readonly, no more interactions)
  router.post("/:id/close", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.text(
        "Session not found",
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    const body = await c.req.parseBody();
    const reason = (body.reason as string) || "no reason";
    const note = ((body.note as string) || "").trim();
    const closeReason =
      note !== "" ? note : reason === "no reason" ? undefined : reason;

    // Update session via Internal API Client
    const updateResult = await apiClient.put<SessionResponse>(
      `/sessions/${sessionId}`,
      {
        status: "closed",
        ...(closeReason !== undefined && { closeReason }),
      },
    );

    if (!updateResult.success) {
      return c.text(
        `Failed to close session: ${updateResult.error}`,
        updateResult.status,
      );
    }

    return c.redirect(`/projects/${session.projectId}/sessions/${sessionId}`);
  });

  // POST /sessions/:id/delete or /projects/:projectId/sessions/:id/delete - Delete session
  router.post("/:id/delete", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.text(
        "Session not found",
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    // Delete session via Internal API Client
    const deleteResult = await apiClient.delete<SessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!deleteResult.success) {
      return c.text(
        `Failed to delete session: ${deleteResult.error}`,
        deleteResult.status,
      );
    }

    return c.redirect(`/projects?selected=${session.projectId}`);
  });

  // GET /sessions/:id/files - Get file tree for a session
  router.get("/:id/files", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");
    const pattern = c.req.query("pattern") ?? "";
    const limitParam = c.req.query("limit");
    const cursorParam = c.req.query("cursor");
    const queryParam = c.req.query("query");
    const wantsPagination = limitParam !== undefined || cursorParam !== undefined;

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);
    try {
      if (wantsPagination) {
        const limit = limitParam ? parseInt(limitParam, 10) : undefined;
        const result = await fileService.listFiles(
          session.agentWorkspacePath,
          {
            limit,
            cursor: cursorParam,
            query: queryParam ?? pattern,
          },
        );
        return c.json(result);
      }

      const allFiles = (await fileService.listFiles(
        session.agentWorkspacePath,
      )) as FileInfo[];
      return c.json(findFiles(pattern, allFiles));
    } catch (err) {
      logger.error("[files] listFiles error:", err);
      return c.json({ error: "Failed to list files" }, 500);
    }
  });

  // POST /sessions/:id/chat - Save a chat message
  router.post("/:id/chat", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.text(
        "Session not found",
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    if (session.status === "closed") {
      return c.text("Session is closed", 403);
    }

    if (!session.activeChatThreadId) {
      return c.text("Create a thread before sending messages", 400);
    }

    const body = await c.req.parseBody();
    const message = body.message as string;

    if (!message) {
      return c.text("Message required", 400);
    }

    // Save message via Internal API Client
    const saveMessageResult = await apiClient.post<SaveMessageResponse>(
      "/chat/messages",
      {
        sessionId,
        threadId: session.activeChatThreadId,
        message: {
          role: "user",
          content: message,
          timestamp: new Date().toISOString(),
        },
      },
    );

    if (!saveMessageResult.success) {
      return c.text(
        `Failed to save message: ${saveMessageResult.error}`,
        saveMessageResult.status,
      );
    }

    // Touch session activity via Internal API Client
    const touchResult = await apiClient.post<void>(
      `/sessions/${sessionId}/touch`,
      {},
    );

    if (!touchResult.success) {
      logger.warn(
        `[session] Failed to touch session activity: ${touchResult.error}`,
      );
    }

    return c.json({ success: true });
  });

  // GET /sessions/:id/impact - Get real-time impact metrics for a session
  router.get("/:id/impact", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.json({ error: "Session not found" }, 404);
    }

    // When the impact background runner is wired up (production path), respond
    // immediately and run fossilUp + recompute off the request. The result and
    // any errors reach the client via the existing impact_calculating /
    // impact_updated / impact_error WebSocket broadcasts. This keeps the Bun
    // event loop free for interactive HTTP/WS requests (send_message, create
    // chat thread) right after page load.
    if (deps.impactBackground) {
      const { calculatingSessions, broadcast } = deps.impactBackground;
      const sccInstalled = mimoContext.services.scc.isInstalled();

      void (async () => {
        try {
          const fossilPath = sessionRepository.getFossilPath(sessionId);
          const { existsSync } = await import("fs");
          const { join } = await import("path");
          const fslckoutPath = join(session.agentWorkspacePath, ".fslckout");

          if (existsSync(fossilPath)) {
            if (!existsSync(fslckoutPath)) {
              logger.debug(
                `[impact] Initializing fossil checkout in agent-workspace...`,
              );
              await vcs.openFossil(fossilPath, session.agentWorkspacePath);
            }
            logger.debug(
              `[impact] Syncing agent-workspace with repo.fossil...`,
            );
            await vcs.fossilUp(session.agentWorkspacePath);
          }

          await handleRefreshImpact({
            sessionId,
            calculatingSessions,
            sendToRequester: () => {
              // No requester: this is an HTTP-triggered background run. The
              // client receives results via the broadcast below.
            },
            broadcast,
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
        } catch (error) {
          logger.error(
            `[impact] Background impact recompute failed for ${sessionId}:`,
            error,
          );
          broadcast(sessionId, {
            type: "impact_error",
            sessionId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          });
        }
      })();

      return c.json({
        calculating: true,
        sccInstalled,
      });
    }

    try {
      const impactCalculator = mimoContext.services.impactCalculator;
      // Sync agent-workspace with repo.fossil before calculating impact
      const fossilPath = sessionRepository.getFossilPath(sessionId);
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      const fslckoutPath = join(session.agentWorkspacePath, ".fslckout");

      if (existsSync(fossilPath)) {
        if (!existsSync(fslckoutPath)) {
          // Initialize fossil checkout if not exists
          logger.debug(
            `[impact] Initializing fossil checkout in agent-workspace...`,
          );
          await vcs.openFossil(fossilPath, session.agentWorkspacePath);
        }
        // Sync with repo.fossil to get latest changes from agent
        logger.debug(`[impact] Syncing agent-workspace with repo.fossil...`);
        await vcs.fossilUp(session.agentWorkspacePath);
      }

      // Check if scc is installed using mimoContext service
      const sccService = mimoContext.services.scc;
      const sccInstalled = sccService.isInstalled();

      if (!sccInstalled) {
        // Return basic file counts without complexity
        const { readdirSync, statSync, readFileSync, lstatSync } =
          await import("fs");
        const entries = readdirSync(session.agentWorkspacePath, {
          withFileTypes: true,
        });
        const files: Map<string, { checksum: string; size: number }> =
          new Map();
        const { relative } = await import("path");

        function scanDir(
          dir: string,
          baseDir: string,
          files: Map<string, { checksum: string; size: number }>,
        ) {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relPath = relative(baseDir, fullPath);
            if (isExcluded(entry.name)) continue;
            const entryStats = lstatSync(fullPath);
            if (entryStats.isDirectory()) {
              scanDir(fullPath, baseDir, files);
            } else if (entryStats.isFile()) {
              const stats = statSync(fullPath);
              const content = readFileSync(fullPath);
              const checksum = crypto
                .createHash("md5")
                .update(content)
                .digest("hex");
              files.set(relPath, { checksum, size: stats.size });
            }
          }
        }

        const upstreamFiles = new Map<
          string,
          { checksum: string; size: number }
        >();
        const workspaceFiles = new Map<
          string,
          { checksum: string; size: number }
        >();

        scanDir(session.upstreamPath, session.upstreamPath, upstreamFiles);
        scanDir(
          session.agentWorkspacePath,
          session.agentWorkspacePath,
          workspaceFiles,
        );

        let newCount = 0,
          changedCount = 0,
          deletedCount = 0;

        for (const [path, info] of workspaceFiles) {
          if (!upstreamFiles.has(path)) newCount++;
          else if (upstreamFiles.get(path)?.checksum !== info.checksum)
            changedCount++;
        }

        for (const [path] of upstreamFiles) {
          if (!workspaceFiles.has(path)) deletedCount++;
        }

        return c.json({
          files: {
            new: newCount,
            changed: changedCount,
            deleted: deletedCount,
          },
          sccInstalled: false,
          warning: "scc not installed - complexity metrics unavailable",
        });
      }

      // Calculate full impact with complexity
      const result = await impactCalculator.calculateImpact(
        sessionId,
        session.upstreamPath,
        session.agentWorkspacePath,
      );

      return c.json({
        ...result,
        sccInstalled: true,
      });
    } catch (error) {
      logger.error("[impact] Failed to calculate impact:", error);
      return c.json({ error: "Failed to calculate impact" }, 500);
    }
  });

  // GET /sessions/:id/fossil-status - Check if fossil server is running and get its URL
  router.get("/:id/fossil-status", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Check shared fossil server status
    const isServerRunning = await sharedFossilServer.isRunning();
    // Always generate the URL - the shared server should eventually be running
    const fossilUrl = getBrowserFossilUrl(sessionId);

    return c.json({
      running: isServerRunning,
      fossilUrl: fossilUrl,
    });
  });

  // PATCH /sessions/:id/config - Update session configuration (idle timeout, etc.)
  router.patch("/:id/config", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.json({ error: "Session not found" }, 404);
    }

    try {
      const body = await c.req.json();
      const idleTimeoutMs =
        body.idleTimeoutMs === undefined
          ? undefined
          : Number(body.idleTimeoutMs);
      const sessionTtlDays =
        body.sessionTtlDays === undefined
          ? undefined
          : Number(body.sessionTtlDays);
      const { priority, browserNotificationsEnabled } = body;

      if (
        idleTimeoutMs === undefined &&
        sessionTtlDays === undefined &&
        priority === undefined &&
        browserNotificationsEnabled === undefined
      ) {
        return c.json(
          {
            error:
              "Either idleTimeoutMs, sessionTtlDays, priority, or browserNotificationsEnabled is required",
          },
          400,
        );
      }

      if (
        priority !== undefined &&
        !["high", "medium", "low"].includes(priority)
      ) {
        return c.json(
          { error: "priority must be one of: high, medium, low" },
          400,
        );
      }

      if (
        browserNotificationsEnabled !== undefined &&
        typeof browserNotificationsEnabled !== "boolean"
      ) {
        return c.json(
          { error: "browserNotificationsEnabled must be a boolean" },
          400,
        );
      }

      // Update session config via Internal API Client
      const updateConfigResult = await apiClient.put<SessionResponse>(
        `/sessions/${sessionId}/config`,
        {
          ...(idleTimeoutMs !== undefined ? { idleTimeoutMs } : {}),
          ...(sessionTtlDays !== undefined ? { sessionTtlDays } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(browserNotificationsEnabled !== undefined
            ? { browserNotificationsEnabled }
            : {}),
        },
      );

      if (!updateConfigResult.success) {
        return c.json(
          { error: `Failed to update config: ${updateConfigResult.error}` },
          updateConfigResult.status,
        );
      }

      const updatedSession = updateConfigResult.data;

      // Notify agent of config change if assigned and online
      if (
        session.assignedAgentId &&
        agentService.isAgentOnline(session.assignedAgentId)
      ) {
        const agentWs = agentService.getAgentConnection(
          session.assignedAgentId,
        );
        if (agentWs && agentWs.readyState === 1) {
          agentWs.send(
            JSON.stringify({
              type: "session_config_updated",
              sessionId,
              config: {
                idleTimeoutMs: updatedSession.idleTimeoutMs,
                sessionTtlDays: updatedSession.sessionTtlDays,
                browserNotificationsEnabled:
                  updatedSession.browserNotificationsEnabled,
              },
              timestamp: new Date().toISOString(),
            }),
          );
        }
      }

      return c.json({
        success: true,
        session: {
          id: updatedSession.id,
          idleTimeoutMs: updatedSession.idleTimeoutMs,
          sessionTtlDays: updatedSession.sessionTtlDays,
          acpStatus: updatedSession.acpStatus,
          browserNotificationsEnabled:
            updatedSession.browserNotificationsEnabled,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  });

  // GET /sessions/:id/settings - Session settings page
  router.get("/:id/settings", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.text(
        "Session not found",
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    const project = await projectRepository.findById(session.projectId);
    if (!project) {
      return c.text("Project not found", 404);
    }

    // Resolve assigned agent name via Internal API Client
    let assignedAgentName: string | null = null;
    if (session.assignedAgentId) {
      const agentResult = await apiClient.get<GetAgentResponse>(
        `/agents/${session.assignedAgentId}`,
      );
      if (agentResult.success) {
        assignedAgentName = agentResult.data.agent?.name ?? null;
      }
    }

    // Resolve MCP server names via Internal API Client
    const mcpServerNames: string[] = [];
    if (session.mcpServerIds && session.mcpServerIds.length > 0) {
      for (const mcpId of session.mcpServerIds) {
        const mcpServerResult = await apiClient.get<GetMcpServerResponse>(
          `/mcp-servers/${mcpId}`,
        );
        if (mcpServerResult.success && mcpServerResult.data.server) {
          mcpServerNames.push(mcpServerResult.data.server.name);
        }
      }
    }

    // Import the settings page component
    const { SessionSettingsPage } =
      await import("../components/SessionSettingsPage.js");

    // Load config via Internal API Client
    const configResult = await apiClient.get<GetConfigResponse>("/config");

    let streamingTimeoutMs = 30000; // default
    if (configResult.success) {
      streamingTimeoutMs = configResult.data.config.streamingTimeoutMs ?? 30000;
    }

    return c.html(
      <SessionSettingsPage
        session={{
          id: session.id,
          name: session.name,
          idleTimeoutMs: session.idleTimeoutMs,
          sessionTtlDays: session.sessionTtlDays,
          acpStatus: session.acpStatus,
          priority: session.priority,
          browserNotificationsEnabled: session.browserNotificationsEnabled,
        }}
        project={{
          id: project.id,
          name: project.name,
        }}
        creationSettings={{
          sessionName: session.name,
          assignedAgentName: assignedAgentName,
          agentSubpath: session.agentSubpath,
          branch: session.branch,
          mcpServerNames: mcpServerNames,
          sessionType: "standard",
        }}
        streamingTimeoutMs={streamingTimeoutMs}
      />,
    );
  });

  // POST /sessions/:id/settings/timeout - Update idle timeout via form
  router.post("/:id/settings/timeout", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.text(
        "Session not found",
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    const body = await c.req.parseBody();
    const idleTimeoutMs = parseInt(body.idleTimeoutMs as string, 10);
    const sessionTtlDays = parseInt(body.sessionTtlDays as string, 10);

    if (
      isNaN(idleTimeoutMs) ||
      (idleTimeoutMs !== 0 && idleTimeoutMs < 10000)
    ) {
      return c.html(
        <div class="error-panel">
          Error: Invalid timeout value. Must be at least 10 seconds (10000ms) or
          0 to disable.
          <br />
          <br />
          <a
            href={`/projects/${session.projectId}/sessions/${sessionId}/settings`}
          >
            Go Back
          </a>
        </div>,
      );
    }

    if (
      isNaN(sessionTtlDays) ||
      !Number.isInteger(sessionTtlDays) ||
      sessionTtlDays < 1
    ) {
      return c.html(
        <div class="error-panel">
          Error: Invalid TTL value. Must be an integer number of days and at
          least 1.
          <br />
          <br />
          <a
            href={`/projects/${session.projectId}/sessions/${sessionId}/settings`}
          >
            Go Back
          </a>
        </div>,
      );
    }

    try {
      // Update the session config via Internal API Client
      const updateConfigResult = await apiClient.put<SessionResponse>(
        `/sessions/${sessionId}/config`,
        {
          idleTimeoutMs,
          sessionTtlDays,
        },
      );

      if (!updateConfigResult.success) {
        return c.html(
          <div class="error-panel">
            Error: {updateConfigResult.error}
            <br />
            <br />
            <a
              href={`/projects/${session.projectId}/sessions/${sessionId}/settings`}
            >
              Go Back
            </a>
          </div>,
        );
      }

      const updatedSession = updateConfigResult.data;

      // Notify agent of config change if assigned and online
      if (
        session.assignedAgentId &&
        agentService.isAgentOnline(session.assignedAgentId)
      ) {
        const agentWs = agentService.getAgentConnection(
          session.assignedAgentId,
        );
        if (agentWs && agentWs.readyState === 1) {
          agentWs.send(
            JSON.stringify({
              type: "session_config_updated",
              sessionId,
              config: { idleTimeoutMs, sessionTtlDays },
              timestamp: new Date().toISOString(),
            }),
          );
        }
      }

      // Redirect back to settings page with success
      return c.redirect(
        `/projects/${session.projectId}/sessions/${sessionId}/settings`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.html(
        <div class="error-panel">
          Error: {message}
          <br />
          <br />
          <a
            href={`/projects/${session.projectId}/sessions/${sessionId}/settings`}
          >
            Go Back
          </a>
        </div>,
      );
    }
  });

  // POST /sessions/:id/settings/priority - Update priority via form
  router.post("/:id/settings/priority", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.text(
        "Session not found",
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    const body = await c.req.parseBody();
    const priority = body.priority as string;

    if (!["high", "medium", "low"].includes(priority)) {
      return c.html(
        <div class="error-panel">
          Error: priority must be one of: high, medium, low
          <br />
          <br />
          <a
            href={`/projects/${session.projectId}/sessions/${sessionId}/settings`}
          >
            Go Back
          </a>
        </div>,
      );
    }

    // Update session config via Internal API Client
    const updateConfigResult = await apiClient.put<SessionResponse>(
      `/sessions/${sessionId}/config`,
      {
        priority: priority as "high" | "medium" | "low",
      },
    );

    if (!updateConfigResult.success) {
      return c.html(
        <div class="error-panel">
          Error: {updateConfigResult.error}
          <br />
          <br />
          <a
            href={`/projects/${session.projectId}/sessions/${sessionId}/settings`}
          >
            Go Back
          </a>
        </div>,
      );
    }

    return c.redirect(
      `/projects/${session.projectId}/sessions/${sessionId}/settings`,
    );
  });

  // ---------------------------------------------------------------------------
  // Chat Thread API  (tasks 3.1 – 3.5)
  // ---------------------------------------------------------------------------

  // GET /:id/chat-threads — list threads + activeChatThreadId
  router.get("/:id/chat-threads", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    return c.json({
      threads: session.chatThreads,
      activeChatThreadId: session.activeChatThreadId,
    });
  });

  // POST /:id/chat-threads — create a new thread
  router.post("/:id/chat-threads", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);

    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      const errorText = sessionResult.error || "Session not found";
      return c.json(
        { error: errorText },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    const body = await c.req.json().catch(() => null);
    if (!body || !body.name) return c.json({ error: "name is required" }, 400);

    if (typeof body.model !== "string" || !body.model.trim()) {
      return c.json({ error: "model is required" }, 400);
    }

    if (typeof body.mode !== "string" || !body.mode.trim()) {
      return c.json({ error: "mode is required" }, 400);
    }

    if (
      typeof body.assignedAgentId !== "string" ||
      !body.assignedAgentId.trim()
    ) {
      return c.json({ error: "assignedAgentId is required" }, 400);
    }

    const assignedAgentId = body.assignedAgentId.trim();

    // Add chat thread via Internal API Client
    const addThreadResult = await apiClient.post<{ thread: any }>(
      `/sessions/${sessionId}/chat-threads`,
      {
        name: body.name,
        model: body.model,
        mode: body.mode,
        acpSessionId: body.acpSessionId || null,
        assignedAgentId,
        state: "active",
        ...(body.instructions !== undefined && {
          instructions: body.instructions,
        }),
      },
    );

    if (!addThreadResult.success) {
      return c.json(
        { error: `Failed to add chat thread: ${addThreadResult.error}` },
        addThreadResult.status,
      );
    }

    const thread = addThreadResult.data.thread;

    // Pre-populate session modelState/modeState from agent capabilities so the
    // context bar dropdowns render immediately without waiting for session_initialized
    if (assignedAgentId && !session.modelState) {
      const agentResult = await apiClient.get<GetAgentResponse>(
        `/agents/${assignedAgentId}`,
      );
      if (agentResult.success) {
        const agent = agentResult.data.agent;
        if (agent?.capabilities) {
          const {
            availableModels,
            defaultModelId,
            availableModes,
            defaultModeId,
          } = agent.capabilities;
          // Update session via Internal API Client
          await apiClient.put<SessionResponse>(`/sessions/${sessionId}`, {
            modelState: {
              currentModelId: defaultModelId,
              availableModels,
              optionId: defaultModelId,
            },
            modeState: {
              currentModeId: defaultModeId,
              availableModes,
              optionId: defaultModeId,
            },
          });
        }
      }
    }

    // Notify the assigned agent if it is online
    if (assignedAgentId && agentService.isAgentOnline(assignedAgentId)) {
      const agentWs = agentService.getAgentConnection(assignedAgentId);
      if (agentWs && agentWs.readyState === 1) {
        // Get full session details for notification
        const fullSessionResult = await apiClient.get<GetSessionResponse>(
          `/sessions/${sessionId}`,
        );
        const sessionWithCreds = fullSessionResult.success
          ? fullSessionResult.data.session
          : null;

        const fossilUrl = sharedFossilServer.getUrl(sessionId);
        let mcpServers: any[] = [];
        if (
          sessionWithCreds?.mcpServerIds &&
          sessionWithCreds.mcpServerIds.length > 0
        ) {
          try {
            // Resolve MCP servers via Internal API Client
            const resolveResult = await apiClient.post<{ servers: any[] }>(
              "/mcp-servers/resolve",
              { ids: sessionWithCreds.mcpServerIds },
            );
            if (resolveResult.success) {
              mcpServers = resolveResult.data.servers;
            }
          } catch (err) {
            logger.error(
              `[session] Failed to resolve MCP servers for session ${sessionId}:`,
              err,
            );
          }
        }
        if (sessionWithCreds?.mcpToken) {
          mcpServers.push(
            createPlatformMcpServerConfig(
              platformUrl,
              sessionWithCreds.mcpToken,
            ),
          );
        }

        agentWs.send(
          JSON.stringify({
            type: "session_ready",
            platformUrl,
            sessions: [
              {
                sessionId,
                name: session.name,
                upstreamPath: session.upstreamPath,
                agentWorkspacePath: session.agentWorkspacePath,
                fossilUrl,
                agentWorkspaceUser: sessionWithCreds?.agentWorkspaceUser,
                agentWorkspacePassword:
                  sessionWithCreds?.agentWorkspacePassword,
                agentSubpath: sessionWithCreds?.agentSubpath ?? null,
                branch: sessionWithCreds?.branch ?? null,
                idleTimeoutMs: sessionWithCreds?.idleTimeoutMs ?? 600000,
                modelState: sessionWithCreds?.modelState ?? null,
                modeState: sessionWithCreds?.modeState ?? null,
                chatThreads: [
                  {
                    chatThreadId: thread.id,
                    name: thread.name,
                    model: thread.model,
                    mode: thread.mode,
                    acpSessionId: thread.acpSessionId,
                    state: thread.state,
                  },
                ],
                activeChatThreadId: thread.id,
                mcpServers,
              },
            ],
          }),
        );
        logger.debug(
          `[session] Notified agent ${assignedAgentId} of new thread ${thread.id} in session ${sessionId}`,
        );

        // Send initial prompt if thread has instructions
        if (thread.instructions) {
          agentWs.send(
            JSON.stringify({
              type: "initial_prompt",
              sessionId,
              chatThreadId: thread.id,
              content: thread.instructions,
            }),
          );
          logger.debug(
            `[session] Sent initial prompt to agent ${assignedAgentId} for thread ${thread.id}`,
          );
        }
      }
    }

    return c.json(thread, 201);
  });

  // PATCH /:id/chat-threads/:threadId — update thread fields
  router.patch("/:id/chat-threads/:threadId", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);

    const sessionId = c.req.param("id");
    const threadId = c.req.param("threadId");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Body required" }, 400);

    // Update chat thread via Internal API Client
    const updateThreadResult = await apiClient.put<SessionResponse>(
      `/sessions/${sessionId}/chat-threads/${threadId}`,
      {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.model !== undefined && { model: body.model }),
        ...(body.mode !== undefined && { mode: body.mode }),
      },
    );

    if (!updateThreadResult.success) {
      return c.json(
        { error: `Failed to update thread: ${updateThreadResult.error}` },
        updateThreadResult.status,
      );
    }

    const updated = updateThreadResult.data;

    return c.json(updated);
  });

  // DELETE /:id/chat-threads/:threadId — remove a thread
  router.delete("/:id/chat-threads/:threadId", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);

    const sessionId = c.req.param("id");
    const threadId = c.req.param("threadId");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    const deletedThread = session.chatThreads.find((t) => t.id === threadId);
    const deletedThreadAgentId =
      deletedThread?.assignedAgentId || session.assignedAgentId;

    // Remove chat thread via Internal API Client
    const removeThreadResult = await apiClient.delete<SessionResponse>(
      `/sessions/${sessionId}/chat-threads/${threadId}`,
    );

    if (!removeThreadResult.success) {
      return c.json(
        { error: `Failed to remove thread: ${removeThreadResult.error}` },
        removeThreadResult.status,
      );
    }

    if (
      deletedThreadAgentId &&
      agentService.isAgentOnline(deletedThreadAgentId)
    ) {
      const agentWs = agentService.getAgentConnection(deletedThreadAgentId);
      if (agentWs && agentWs.readyState === 1) {
        agentWs.send(
          JSON.stringify({
            type: "thread_deleted",
            sessionId,
            chatThreadId: threadId,
          }),
        );
      }
    }

    return c.body(null, 204);
  });

  // POST /:id/chat-threads/:threadId/activate — set active thread
  router.post("/:id/chat-threads/:threadId/activate", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);

    const sessionId = c.req.param("id");
    const threadId = c.req.param("threadId");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    try {
      // Set active chat thread via Internal API Client
      const activateResult = await apiClient.post<void>(
        `/sessions/${sessionId}/active-thread`,
        { threadId },
      );

      if (!activateResult.success) {
        return c.json(
          { error: `Failed to set active thread: ${activateResult.error}` },
          activateResult.status,
        );
      }
    } catch {
      return c.json({ error: "Thread not found" }, 404);
    }

    return c.json({ activeChatThreadId: threadId });
  });

  // GET /:id/chat-threads/:threadId/messages — get thread messages
  router.get("/:id/chat-threads/:threadId/messages", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);

    const sessionId = c.req.param("id");
    const threadId = c.req.param("threadId");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    // Check thread exists
    const threadExists = session.chatThreads.some((t) => t.id === threadId);
    if (!threadExists) return c.json({ error: "Thread not found" }, 404);

    try {
      // Load chat history via Internal API Client
      const chatResult = await apiClient.get<GetChatHistoryResponse>(
        `/sessions/${sessionId}/chat?threadId=${threadId}`,
      );

      if (!chatResult.success) {
        return c.json(
          { error: `Failed to load messages: ${chatResult.error}` },
          chatResult.status,
        );
      }

      const messages = chatResult.data.messages;

      return c.json(messages);
    } catch (err) {
      return c.json({ error: "Failed to load messages" }, 500);
    }
  });

  // Files API - read file content from agent workspace (companion to the list route above)

  router.get("/:id/files/content", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "path query param required" }, 400);

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);
    let raw: string;
    try {
      raw = await fileService.readFile(session.agentWorkspacePath, filePath);
    } catch (err: any) {
      if (err?.message?.includes("Access denied"))
        return c.json({ error: "Access denied" }, 403);
      return c.json({ error: "File not found" }, 404);
    }
    const language = detectLanguage(filePath);
    const name = filePath.split("/").pop() ?? filePath;
    const lineCount = raw.split("\n").length;
    return c.json({
      path: filePath,
      name,
      language,
      lineCount,
      content: escapeHtml(raw),
    });
  });

  // GET /sessions/:id/files/upstream-content?path=...
  router.get("/:id/files/upstream-content", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "path query param required" }, 400);

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);
    let raw: string;
    try {
      raw = await fileService.readFile(session.upstreamPath, filePath);
    } catch (err: any) {
      if (err?.message?.includes("Access denied"))
        return c.json({ error: "Access denied" }, 403);
      return c.json({ error: "File not found" }, 404);
    }
    const language = detectLanguage(filePath);
    const name = filePath.split("/").pop() ?? filePath;
    const lineCount = raw.split("\n").length;
    return c.json({
      path: filePath,
      name,
      language,
      lineCount,
      content: escapeHtml(raw),
    });
  });

  // GET /sessions/:id/search?q=...&context=...
  router.get("/:id/search", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");
    const query = c.req.query("q");
    const contextLines = parseInt(c.req.query("context") ?? "2", 10);

    if (!query) return c.json({ error: "q query param required" }, 400);

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    const workspacePath = session.agentWorkspacePath;

    try {
      const results = await searchService.searchContent(workspacePath, query, {
        contextLines,
        maxResults: 100,
      });

      const uniqueFiles = new Set(results.map((r) => r.path)).size;

      return c.json({
        results,
        total: results.length,
        uniqueFiles,
        truncated: results.length >= 100,
      });
    } catch (err: any) {
      if (err instanceof SearchServiceError) {
        return c.json({ error: err.message, code: err.code }, 400);
      }
      logger.error("[search] error:", err);
      return c.json({ error: "Search failed" }, 500);
    }
  });

  // ---------------------------------------------------------------------------
  // Expert Mode API
  // ---------------------------------------------------------------------------

  // POST /sessions/:id/files/copy - Copy file to temp for expert mode
  router.post("/:id/files/copy", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "path query param required" }, 400);

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    try {
      const result = await expertService.readFileContent(
        session.agentWorkspacePath,
        filePath,
      );
      return c.json(result);
    } catch (err: any) {
      logger.error("[expert] readFileContent error:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  // POST /sessions/:id/files/write - Write content to file
  router.post("/:id/files/write", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const path = body?.path;
    const content = body?.content;
    if (!path || content === undefined)
      return c.json({ error: "path and content required" }, 400);

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    try {
      const result = await expertService.writeFileContent(
        session.agentWorkspacePath,
        path,
        content,
      );
      return c.json(result);
    } catch (err: any) {
      if (
        err.message.includes("Invalid path") ||
        err.message.includes("not found")
      ) {
        return c.json({ error: err.message }, 400);
      }
      logger.error("[expert] writeFileContent error:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  // ---------------------------------------------------------------------------
  // Patch API
  // ---------------------------------------------------------------------------

  // GET /sessions/:id/patches - List pending patches
  router.get("/:id/patches", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    try {
      const patches = await expertService.listPatchFiles(
        session.agentWorkspacePath,
      );
      return c.json({ patches });
    } catch (err: any) {
      logger.error("[patches] listPatchFiles error:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  // POST /sessions/:id/patches - Write a patch file
  router.post("/:id/patches", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    const body = await c.req.json().catch(() => null);
    const originalPath = body?.originalPath;
    const content = body?.content;
    if (!originalPath || content === undefined) {
      return c.json({ error: "originalPath and content required" }, 400);
    }

    try {
      const result = await expertService.writePatchFile(
        session.agentWorkspacePath,
        originalPath,
        content,
      );
      return c.json(result);
    } catch (err: any) {
      logger.error("[patches] writePatchFile error:", err);
      return c.json({ error: err.message }, 400);
    }
  });

  // POST /sessions/:id/patches/approve - Approve a patch and send to agent
  router.post("/:id/patches/approve", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    const body = await c.req.json().catch(() => null);
    const originalPath = body?.originalPath;
    if (!originalPath) return c.json({ error: "originalPath required" }, 400);

    try {
      // Read the patch file content
      const { readFileSync, existsSync, unlinkSync } = await import("fs");
      const { join } = await import("path");
      const patchPath = join(".mimo-patches", originalPath).replace(/\\/g, "/");
      const fullPatchPath = join(session.agentWorkspacePath, patchPath).replace(
        /\\/g,
        "/",
      );

      if (!existsSync(fullPatchPath)) {
        return c.json({ error: `Patch file not found: ${patchPath}` }, 404);
      }

      const content = readFileSync(fullPatchPath, "utf-8");

      // Find the agent to use: active chat thread agent first, then session-level
      let targetAgentId: string | null = null;

      // Check active chat thread's assigned agent first
      if (session.activeChatThreadId && session.chatThreads) {
        const activeThread = session.chatThreads.find(
          (t) => t.id === session.activeChatThreadId,
        );
        if (activeThread?.assignedAgentId) {
          targetAgentId = activeThread.assignedAgentId;
        }
      }

      // Fall back to session-level assigned agent
      if (!targetAgentId) {
        targetAgentId = session.assignedAgentId || null;
      }

      if (!targetAgentId) {
        return c.json({ error: "No agent assigned to session" }, 400);
      }

      if (!agentService.isAgentOnline(targetAgentId)) {
        return c.json({ error: "Agent is not online" }, 503);
      }

      // Send file content to agent's checkout path
      const sent = await agentService.sendFileToAgent(
        targetAgentId,
        sessionId,
        originalPath,
        content,
      );

      if (!sent) {
        return c.json({ error: "Failed to send file to agent" }, 500);
      }

      // Delete local patch file after successful send
      unlinkSync(fullPatchPath);

      return c.json({ success: true, sent: true });
    } catch (err: any) {
      logger.error("[patches] approvePatch error:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  // DELETE /sessions/:id/patches - Decline (delete) a patch
  router.delete("/:id/patches", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");

    // Get session via Internal API Client
    const apiClient = createApiClient(c);
    const sessionResult = await apiClient.get<GetSessionResponse>(
      `/sessions/${sessionId}`,
    );

    if (!sessionResult.success) {
      return c.json(
        { error: "Session not found" },
        sessionResult.status === 404 ? 404 : 500,
      );
    }

    const session = sessionResult.data.session;

    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    const body = await c.req.json().catch(() => null);
    const patchPath = body?.patchPath;
    if (!patchPath) return c.json({ error: "patchPath required" }, 400);

    try {
      const result = await expertService.declinePatch(
        session.agentWorkspacePath,
        patchPath,
      );
      return c.json(result);
    } catch (err: any) {
      if (err.message.includes("must start with")) {
        return c.json({ error: err.message }, 400);
      }
      logger.error("[patches] declinePatch error:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  return router;
}
