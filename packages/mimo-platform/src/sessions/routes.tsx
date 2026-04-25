/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import crypto from "crypto";
import { SessionDetailPage } from "../components/SessionDetailPage.js";
import { SessionCreatePage } from "../components/SessionCreatePage.js";
import type { Context } from "hono";
import { normalizeFrameState, updateFrameState } from "./frame-state.js";
import { logger } from "../logger.js";
import type { MimoContext } from "../context/mimo-context.js";
import { createFileService, findFiles } from "../files/service.js";
import { detectLanguage, escapeHtml } from "../files/syntax-highlighter.js";
import { spawnRipgrep, checkRipgrepAvailable, SearchServiceError } from "../files/search-service.js";
import { canDeleteSessionNow } from "./session-retention.js";
import { createSessionDeletionUseCase } from "./session-deletion.js";
import { VCS_INTERNALS } from "../vcs/index.js";
import { mcpTokenStore } from "../mcp/token-store.js";
import { createPlatformMcpServerConfig } from "../mcp/platform-config.js";

type SessionsRoutesContext = Pick<MimoContext, "services" | "repos" | "env">;

export function createSessionsRoutes(mimoContext: SessionsRoutesContext) {
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
  const platformUrl = mimoContext.env?.PLATFORM_URL ?? "http://localhost:3000";
  const fileService = createFileService();
  const expertService = mimoContext.services.expert;
  const sessionDeletion = createSessionDeletionUseCase({
    sessionRepository,
    sessionStateService,
    fileSyncService: mimoContext.services.fileSync,
    impactCalculator: mimoContext.services.impactCalculator,
    agentService,
    mcpTokenStore,
  });

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
  router.get("/", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const projectId = getProjectId(c);

    // Scoped to a single project (used by /projects/:id/sessions)
    if (projectId) {
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

    const mcpServers = await mcpServerService.findAll();

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
    const agentSubpath = (body.agentSubpath as string) || null;
    const branchName = (body.branchName as string) || null;
    const sessionTtlDaysRaw = (body.sessionTtlDays as string) || "180";
    const sessionTtlDays = parseInt(sessionTtlDaysRaw, 10);
    const branchModeRaw = (body.branchMode as string) || "new";
    const branchMode: "new" | "sync" =
      branchModeRaw === "sync" ? "sync" : "new";
    const priorityRaw = (body.priority as string) || undefined;
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

    const project = await projectRepository.findById(projectId);
    if (!project || project.owner !== username) {
      return c.text("Project not found", 404);
    }

    if (branchMode === "sync" && !branchName) {
      return c.text(
        "Branch name is required when syncing an existing branch",
        400,
      );
    }
    if (branchMode === "sync" && project.repoType !== "git") {
      return c.text("Sync mode is only supported for git repositories", 400);
    }

    // Validate MCP server IDs if provided
    if (mcpServerIds.length > 0) {
      try {
        // Check all MCP servers exist
        for (const id of mcpServerIds) {
          const server = await mcpServerService.findById(id);
          if (!server) {
            return c.text(`MCP server '${id}' not found`, 400);
          }
        }

        // Check for duplicate MCP server names
        const duplicateName =
          await mcpServerService.findDuplicateNames(mcpServerIds);
        if (duplicateName) {
          return c.text(
            `Duplicate MCP server name '${duplicateName}' in selection`,
            400,
          );
        }
      } catch (error: any) {
        return c.text(`MCP server validation error: ${error.message}`, 500);
      }
    }

    // Create session with upstream and checkout directories
    const session = await sessionRepository.create({
      name: name as string,
      projectId: projectId as string,
      owner: username,
      agentSubpath: agentSubpath || undefined,
      mcpServerIds: mcpServerIds.length > 0 ? mcpServerIds : undefined,
      sessionTtlDays,
      priority,
    });

    // Initialize repository: clone → import to fossil
    // Note: checkout is created by agent when it receives session_ready
    try {
      // Step 1: Clone repository to upstream/
      // In sync mode, clone the existing remote branch directly; otherwise use
      // the project's configured sourceBranch.
      const cloneBranch =
        branchMode === "sync" ? branchName! : project.sourceBranch;
      const cloneResult = await vcs.cloneRepository(
        project.repoUrl,
        project.repoType,
        session.upstreamPath,
        undefined,
        cloneBranch,
      );

      if (!cloneResult.success) {
        await sessionRepository.delete(projectId, session.id);
        return c.text(`Failed to clone repository: ${cloneResult.error}`, 500);
      }

      // Step 2: Import to fossil proxy (repo.fossil)
      const fossilPath = sessionRepository.getFossilPath(session.id);
      const importResult = await vcs.importToFossil(
        session.upstreamPath,
        project.repoType,
        fossilPath,
      );

      if (!importResult.success) {
        await sessionRepository.delete(projectId, session.id);
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

      // Step 3: Resolve branch based on mode.
      // - "new": clone default sourceBranch, then create branch locally
      //   (session override takes priority over project default).
      // - "sync": clone --branch already put us on the target branch; just persist.
      if (branchMode === "new") {
        const effectiveBranch = branchName || project.newBranch || null;
        if (effectiveBranch) {
          const branchResult = await vcs.createBranch(
            effectiveBranch,
            project.repoType,
            session.upstreamPath,
          );
          if (!branchResult.success) {
            await sessionRepository.delete(projectId, session.id);
            return c.text(
              `Failed to create branch '${effectiveBranch}': ${branchResult.error}`,
              500,
            );
          }
          await sessionRepository.update(session.id, {
            branch: effectiveBranch,
          });
        }
      } else {
        // sync mode: branchName is already checked out via clone --branch
        await sessionRepository.update(session.id, { branch: branchName! });
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
        await sessionRepository.delete(projectId, session.id);
        return c.text("Failed to create session workspace user", 500);
      }

      // Save credentials to session
      await sessionRepository.update(session.id, {
        agentWorkspaceUser,
        agentWorkspacePassword,
      });

      // Step 5: Open fossil checkout in agent-workspace
      const openResult = await vcs.openFossil(
        fossilPath,
        session.agentWorkspacePath,
      );
      if (!openResult.success) {
        logger.error(
          "[session] Failed to open fossil in agent-workspace:",
          openResult.error,
        );
        await sessionRepository.delete(projectId, session.id);
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

      // Step 6: Resolve MCP servers if attached
      let mcpServers: any[] = [];
      if (mcpServerIds.length > 0) {
        try {
          mcpServers = await mcpServerService.resolveMcpServers(mcpServerIds);
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
      await sessionRepository.delete(projectId, session.id);
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

    // List all sessions and filter by owner
    const allSessions = await sessionRepository.listAll();
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
  router.get("/:id", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");
    const session = await sessionRepository.findById(sessionId);

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    const project = await projectRepository.findById(session.projectId);
    if (!project) {
      return c.text("Project not found", 404);
    }

    // Get chat history for the active thread
    const chatHistory = await chatService.loadHistory(
      sessionId,
      session.activeChatThreadId,
    );

    // Get assigned agent if any
    let agent = undefined;
    if (session.assignedAgentId) {
      agent = await agentRepository.findById(session.assignedAgentId);
    }

    // Get model/mode state from in-memory store, fallback to persisted session data
    const modelState =
      sessionStateService.getModelState(sessionId) ?? session.modelState;
    const modeState =
      sessionStateService.getModeState(sessionId) ?? session.modeState;

    // Always generate fossil URL - the shared server should be running
    // If it's not running yet, the URL will still be valid but the server won't respond
    const fossilUrl = sharedFossilServer.getUrl(sessionId);
    const cloneWorkspaceCommand =
      session.agentWorkspaceUser && session.agentWorkspacePassword
        ? `fossil open ${shellDoubleQuote(buildAuthenticatedUrl(fossilUrl, session.agentWorkspaceUser, session.agentWorkspacePassword))} --workdir ${shellDoubleQuote(sanitizeSessionNameForWorkdir(session.name))} --repodir ${shellDoubleQuote(sanitizeSessionNameForWorkdir(session.name))}`
        : null;

    // Resolve attached MCP servers for display
    const mcpServers = await Promise.all(
      (session.mcpServerIds ?? []).map((id) => mcpServerService.findById(id)),
    ).then((results) =>
      results.filter((s): s is NonNullable<typeof s> => s !== null),
    );

    const loadedConfig = configService.load();
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
  });

  // GET /sessions/:id/frame-state - Fetch frame state
  router.get("/:id/frame-state", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = c.req.param("id");
    const session = await sessionRepository.findById(sessionId);
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
    const session = await sessionRepository.findById(sessionId);
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
    await sessionRepository.update(sessionId, { frameState: nextState });

    return c.json(nextState);
  });

  // GET /sessions/:id/notes - Fetch notes content
  router.get("/:id/notes", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = c.req.param("id");
    const session = await sessionRepository.findById(sessionId);
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
    const session = await sessionRepository.findById(sessionId);
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
    const session = await sessionRepository.findById(sessionId);

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    const cancelled = await agentService.cancelCurrentRequest(sessionId);

    return c.json({ success: cancelled });
  });

  // POST /sessions/:id/close - Close session (readonly, no more interactions)
  router.post("/:id/close", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");
    const session = await sessionRepository.findById(sessionId);

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    await sessionRepository.update(sessionId, { status: "closed" });

    return c.redirect(
      `/projects/${session.projectId}/sessions/${sessionId}`,
    );
  });

  // POST /sessions/:id/delete or /projects/:projectId/sessions/:id/delete - Delete session
  router.post("/:id/delete", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");
    const session = await sessionRepository.findById(sessionId);

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    await sessionDeletion.deleteSessionByRecord(session);

    return c.redirect(`/projects?selected=${session.projectId}`);
  });

  // GET /sessions/:id/files - Get file tree for a session
  router.get("/:id/files", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.param("id");
    const pattern = c.req.query("pattern") ?? "";
    const session = await sessionRepository.findById(sessionId);
    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);
    try {
      const allFiles = await fileService.listFiles(session.agentWorkspacePath);
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
    const session = await sessionRepository.findById(sessionId);

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    if (session.status === "closed") {
      return c.text("Session is closed", 403);
    }

    const body = await c.req.parseBody();
    const message = body.message as string;

    if (!message) {
      return c.text("Message required", 400);
    }

    if (!session.activeChatThreadId) {
      return c.text("Create a thread before sending messages", 400);
    }

    await chatService.saveMessage(
      sessionId,
      {
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      },
      session.activeChatThreadId,
    );

    await sessionRepository.touchSessionActivity(sessionId);

    return c.json({ success: true });
  });

  // GET /sessions/:id/impact - Get real-time impact metrics for a session
  router.get("/:id/impact", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = c.req.param("id");
    const session = await sessionRepository.findById(sessionId);

    if (!session || session.owner !== username) {
      return c.json({ error: "Session not found" }, 404);
    }

    try {
      const impactCalculator = mimoContext.services.impactCalculator;
      const { vcs } = await import("../vcs/index.js");

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
const { readdirSync, statSync, readFileSync, lstatSync } = await import("fs");
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relPath = relative(baseDir, fullPath);
            if (VCS_INTERNALS.has(entry.name)) continue;
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
          };
        
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
    const session = await sessionRepository.findById(sessionId);

    if (!session || session.owner !== username) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Check shared fossil server status
    const isServerRunning = await sharedFossilServer.isRunning();
    // Always generate the URL - the shared server should eventually be running
    const fossilUrl = sharedFossilServer.getUrl(sessionId);

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
    const session = await sessionRepository.findById(sessionId);

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
      const { priority } = body;

      if (
        idleTimeoutMs === undefined &&
        sessionTtlDays === undefined &&
        priority === undefined
      ) {
        return c.json(
          {
            error:
              "Either idleTimeoutMs, sessionTtlDays, or priority is required",
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

      // Update session config (validation happens in repository)
      const updatedSession = await sessionRepository.updateSessionConfig(
        sessionId,
        {
          ...(idleTimeoutMs !== undefined ? { idleTimeoutMs } : {}),
          ...(sessionTtlDays !== undefined ? { sessionTtlDays } : {}),
          ...(priority !== undefined ? { priority } : {}),
        },
      );

      if (!updatedSession) {
        return c.json({ error: "Failed to update session configuration" }, 500);
      }

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
    const session = await sessionRepository.findById(sessionId);

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    const project = await projectRepository.findById(session.projectId);
    if (!project) {
      return c.text("Project not found", 404);
    }

    // Resolve assigned agent name
    let assignedAgentName: string | null = null;
    if (session.assignedAgentId) {
      const agent = await agentRepository.findById(session.assignedAgentId);
      assignedAgentName = agent?.name ?? null;
    }

    // Resolve MCP server names
    const mcpServerNames: string[] = [];
    if (session.mcpServerIds && session.mcpServerIds.length > 0) {
      for (const mcpId of session.mcpServerIds) {
        const mcpServer = await mcpServerService.findById(mcpId);
        if (mcpServer) {
          mcpServerNames.push(mcpServer.name);
        }
      }
    }

    // Import the settings page component
    const { SessionSettingsPage } =
      await import("../components/SessionSettingsPage.js");

    const streamingTimeoutMs = configService.load().streamingTimeoutMs;

    return c.html(
      <SessionSettingsPage
        session={{
          id: session.id,
          name: session.name,
          idleTimeoutMs: session.idleTimeoutMs,
          sessionTtlDays: session.sessionTtlDays,
          acpStatus: session.acpStatus,
          priority: session.priority,
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
    const session = await sessionRepository.findById(sessionId);

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
        <div style="padding: 20px; color: #ff6b6b;">
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
        <div style="padding: 20px; color: #ff6b6b;">
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
      // Update the session config
      await sessionRepository.updateSessionConfig(sessionId, {
        idleTimeoutMs,
        sessionTtlDays,
      });

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
        <div style="padding: 20px; color: #ff6b6b;">
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
    const session = await sessionRepository.findById(sessionId);

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    const body = await c.req.parseBody();
    const priority = body.priority as string;

    if (!["high", "medium", "low"].includes(priority)) {
      return c.html(
        <div style="padding: 20px; color: #ff6b6b;">
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

    await sessionRepository.updateSessionConfig(sessionId, {
      priority: priority as "high" | "medium" | "low",
    });

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
    const session = await sessionRepository.findById(sessionId);
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
    const session = await sessionRepository.findById(sessionId);
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

    const thread = await sessionRepository.addChatThread(sessionId, {
      name: body.name,
      model: body.model,
      mode: body.mode,
      acpSessionId: null,
      assignedAgentId,
      state: "active",
    });

    // Pre-populate session modelState/modeState from agent capabilities so the
    // context bar dropdowns render immediately without waiting for session_initialized
    if (assignedAgentId && !session.modelState) {
      const agent = await agentRepository.findById(assignedAgentId);
      if (agent?.capabilities) {
        const {
          availableModels,
          defaultModelId,
          availableModes,
          defaultModeId,
        } = agent.capabilities;
        await sessionRepository.update(sessionId, {
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

    // Notify the assigned agent if it is online
    if (assignedAgentId && agentService.isAgentOnline(assignedAgentId)) {
      const agentWs = agentService.getAgentConnection(assignedAgentId);
      if (agentWs && agentWs.readyState === 1) {
        const sessionWithCreds = await sessionRepository.findById(sessionId);
        const fossilUrl = sharedFossilServer.getUrl(sessionId);
        let mcpServers: any[] = [];
        if (
          sessionWithCreds?.mcpServerIds &&
          sessionWithCreds.mcpServerIds.length > 0
        ) {
          try {
            mcpServers = await mcpServerService.resolveMcpServers(
              sessionWithCreds.mcpServerIds,
            );
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
    const session = await sessionRepository.findById(sessionId);
    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Body required" }, 400);

    const updated = await sessionRepository.updateChatThread(
      sessionId,
      threadId,
      {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.model !== undefined && { model: body.model }),
        ...(body.mode !== undefined && { mode: body.mode }),
      },
    );

    if (!updated) return c.json({ error: "Thread not found" }, 404);
    return c.json(updated);
  });

  // DELETE /:id/chat-threads/:threadId — remove a thread
  router.delete("/:id/chat-threads/:threadId", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);

    const sessionId = c.req.param("id");
    const threadId = c.req.param("threadId");
    const session = await sessionRepository.findById(sessionId);
    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    if (session.chatThreads.length <= 1)
      return c.json({ error: "Cannot delete the last thread" }, 400);

    await sessionRepository.removeChatThread(sessionId, threadId);

    const deletedThread = session.chatThreads.find((t) => t.id === threadId);
    const deletedThreadAgentId =
      deletedThread?.assignedAgentId || session.assignedAgentId;
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
    const session = await sessionRepository.findById(sessionId);
    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    try {
      await sessionRepository.setActiveChatThread(sessionId, threadId);
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
    const session = await sessionRepository.findById(sessionId);
    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    // Check thread exists
    const threadExists = session.chatThreads.some((t) => t.id === threadId);
    if (!threadExists) return c.json({ error: "Thread not found" }, 404);

    try {
      const messages = await chatService.loadHistory(sessionId, threadId);
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
    const session = await sessionRepository.findById(sessionId);
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
    const session = await sessionRepository.findById(sessionId);
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

    const session = await sessionRepository.findById(sessionId);
    if (!session || session.owner !== username)
      return c.json({ error: "Session not found" }, 404);

    const workspacePath = session.agentWorkspacePath;

    try {
      const results = await spawnRipgrep({
        workspacePath,
        query,
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
    const session = await sessionRepository.findById(sessionId);
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
    const session = await sessionRepository.findById(sessionId);
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
    const session = await sessionRepository.findById(sessionId);
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
    const session = await sessionRepository.findById(sessionId);
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
    const session = await sessionRepository.findById(sessionId);
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
    const session = await sessionRepository.findById(sessionId);
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
