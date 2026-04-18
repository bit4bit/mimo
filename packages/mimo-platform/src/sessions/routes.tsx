/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import crypto from "crypto";
import { SessionDetailPage } from "../components/SessionDetailPage.js";
import { SessionCreatePage } from "../components/SessionCreatePage.js";
import { SessionListPage } from "../components/SessionListPage.js";
import type { Context } from "hono";
import { normalizeFrameState, updateFrameState } from "./frame-state.js";
import { logger } from "../logger.js";
import type { MimoContext } from "../context/mimo-context.js";

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

  // GET /sessions or /projects/:projectId/sessions - List sessions for a project
  router.get("/", async (c: Context) => {
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

    const sessions = await sessionRepository.listByProject(projectId);

    return c.html(<SessionListPage project={project} sessions={sessions} />);
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

    const agents = await agentService.listAgentsByOwner(username);
    const mcpServers = await mcpServerService.findAll();

    return c.html(
      <SessionCreatePage
        project={project}
        agents={agents}
        mcpServers={mcpServers}
      />,
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
    const assignedAgentId = (body.assignedAgentId as string) || null;
    const localDevMirrorPath = (body.localDevMirrorPath as string) || null;
    const agentSubpath = (body.agentSubpath as string) || null;
    const branchName = (body.branchName as string) || null;

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

    const project = await projectRepository.findById(projectId);
    if (!project || project.owner !== username) {
      return c.text("Project not found", 404);
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
      assignedAgentId: assignedAgentId || undefined,
      localDevMirrorPath: localDevMirrorPath || undefined,
      agentSubpath: agentSubpath || undefined,
      mcpServerIds: mcpServerIds.length > 0 ? mcpServerIds : undefined,
    });

    // Initialize repository: clone → import to fossil
    // Note: checkout is created by agent when it receives session_ready
    try {
      // Step 1: Clone repository to upstream/
      const cloneResult = await vcs.cloneRepository(
        project.repoUrl,
        project.repoType,
        session.upstreamPath,
        undefined,
        project.sourceBranch,
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

      // Step 3: Create branch if specified — session override takes priority over project default
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
        // Persist so the commit service can push to the correct branch
        await sessionRepository.update(session.id, { branch: effectiveBranch });
      }

      // Step 4: Create fossil user for agent access
      const agentWorkspaceUser = `agent-${session.id.slice(0, 8)}`;
      const agentWorkspacePassword = crypto
        .randomUUID()
        .replace(/-/g, "")
        .slice(0, 16);
      const userResult = await vcs.createFossilUser(
        fossilPath,
        agentWorkspaceUser,
        agentWorkspacePassword,
      );

      if (!userResult.success) {
        logger.error(
          "[session] Failed to create fossil user:",
          userResult.error,
        );
        // Non-fatal - session can still work, just log the error
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

      // Step 7: Notify running agent if one is assigned and online
      if (assignedAgentId && agentService.isAgentOnline(assignedAgentId)) {
        const agentWs = agentService.getAgentConnection(assignedAgentId);
        if (agentWs && agentWs.readyState === 1) {
          // Use shared fossil server - no need to start per-session server
          const fossilUrl = sharedFossilServer.getUrl(session.id);
          await sessionRepository.update(session.id, { fossilPath });
          const sessionWithCreds = await sessionRepository.findById(session.id);
          agentWs.send(
            JSON.stringify({
              type: "session_ready",
              platformUrl,
              sessions: [
                {
                  sessionId: session.id,
                  name: session.name,
                  upstreamPath: session.upstreamPath,
                  agentWorkspacePath: session.agentWorkspacePath,
                  fossilUrl,
                  agentWorkspaceUser: sessionWithCreds?.agentWorkspaceUser,
                  agentWorkspacePassword:
                    sessionWithCreds?.agentWorkspacePassword,
                  acpSessionId: sessionWithCreds?.acpSessionId ?? null,
                  localDevMirrorPath:
                    sessionWithCreds?.localDevMirrorPath ?? null,
                  agentSubpath: sessionWithCreds?.agentSubpath ?? null,
                  mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
                },
              ],
            }),
          );
          logger.debug(
            `[session] Notified running agent ${assignedAgentId} of new session ${session.id}`,
          );
        }
      }
    } catch (error) {
      logger.error("Failed to setup session:", error);
      await sessionRepository.delete(projectId, session.id);
      return c.text("Failed to setup session repository", 500);
    }

    return c.redirect(`/projects/${projectId}/sessions/${session.id}`);
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

    // Resolve attached MCP servers for display
    const mcpServers = await Promise.all(
      (session.mcpServerIds ?? []).map((id) => mcpServerService.findById(id)),
    ).then((results) =>
      results.filter((s): s is NonNullable<typeof s> => s !== null),
    );

    const loadedConfig = configService.load();
    const streamingTimeoutMs = loadedConfig.streamingTimeoutMs;
    const sessionKeybindings = loadedConfig.sessionKeybindings;

    return c.html(
      <SessionDetailPage
        session={session}
        project={project}
        chatHistory={chatHistory}
        frameState={normalizeFrameState(session.frameState)}
        notesContent={frameStateService.loadNotes(session.id)}
        projectId={session.projectId}
        projectNotesContent={frameStateService.loadProjectNotes(session.projectId)}
        agent={agent}
        modelState={modelState}
        modeState={modeState}
        fossilUrl={fossilUrl}
        acpStatus={session.acpStatus}
        mcpServers={mcpServers}
        streamingTimeoutMs={streamingTimeoutMs}
        sessionKeybindings={sessionKeybindings}
        chatThreads={session.chatThreads}
        activeChatThreadId={session.activeChatThreadId}
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
    const activeBufferId = body.activeBufferId as string;

    if ((frame !== "left" && frame !== "right") || !activeBufferId) {
      return c.json({ error: "Invalid frame-state payload" }, 400);
    }

    const nextState = updateFrameState(
      session.frameState,
      frame,
      activeBufferId,
    );
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

    // Delete session and cleanup all associated resources
    await sessionRepository.delete(session.projectId, sessionId);

    // Note: fossil file is deleted by SessionRepository.delete()
    // No need to stop any server - shared server continues running

    // Clear in-memory session state
    sessionStateService.clearSessionState(sessionId);

    // Cleanup sync tracking data
    await mimoContext.services.fileSync.cleanupSession(sessionId);

    // Clear impact calculator cache
    mimoContext.services.impactCalculator.clearState(sessionId);

    // Notify assigned agent if any
    if (session.assignedAgentId) {
      await agentService.notifySessionEnded(sessionId, session.assignedAgentId);
    }

    return c.redirect(`/projects/${session.projectId}/sessions`);
  });

  // GET /sessions/:id/files - Get file tree for a session
  router.get("/:id/files", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const sessionId = c.req.param("id");
    const session = await sessionRepository.findById(sessionId);

    if (!session || session.owner !== username) {
      return c.text("Session not found", 404);
    }

    // Scan filesystem directly for files
    const { readdirSync, statSync } = await import("fs");
    const { join, relative } = await import("path");

    const fileTree: { [key: string]: string[] } = {};

    function scanDir(dirPath: string, basePath: string) {
      if (!statSync(dirPath, { throwIfNoEntry: false })) {
        return;
      }

      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        const relPath = relative(basePath, fullPath);

        if (entry.isDirectory()) {
          scanDir(fullPath, basePath);
        } else {
          const parts = relPath.split("/");
          const fileName = parts.pop() || "";
          const dir = parts.length > 0 ? parts.join("/") : "(root)";

          if (!fileTree[dir]) {
            fileTree[dir] = [];
          }
          fileTree[dir].push(fileName);
        }
      }
    }

    try {
      scanDir(session.agentWorkspacePath, session.agentWorkspacePath);
    } catch (error) {
      logger.error("Error scanning checkout:", error);
    }

    // Return HTML file tree
    let html = `<!DOCTYPE html>
<html>
<head><title>File Tree</title></head>
<body>
<div class="file-tree">
`;

    for (const [dir, files] of Object.entries(fileTree)) {
      html += `  <div class="dir">${dir}/</div>\n`;
      for (const file of files) {
        html += `    <div class="file">${file}</div>\n`;
      }
    }

    html += `</div>
</body>
</html>`;

    return c.html(html);
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
        const { readdirSync, statSync, readFileSync } = await import("fs");
        const { join, relative } = await import("path");
        const crypto = await import("crypto");

        const scanDir = (
          dir: string,
          baseDir: string,
          files: Map<string, { checksum: string; size: number }>,
        ) => {
          if (!statSync(dir, { throwIfNoEntry: false })) return;
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relPath = relative(baseDir, fullPath);
            if (entry.name.startsWith(".")) continue;
            if (entry.isDirectory()) {
              scanDir(fullPath, baseDir, files);
            } else {
              const stats = statSync(fullPath);
              const content = readFileSync(fullPath);
              const checksum = crypto
                .createHash("md5")
                .update(content)
                .digest("hex");
              files.set(relPath, { checksum, size: stats.size });
            }
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
      const { idleTimeoutMs } = body;

      if (idleTimeoutMs === undefined) {
        return c.json({ error: "idleTimeoutMs is required" }, 400);
      }

      // Update session config (validation happens in repository)
      const updatedSession = await sessionRepository.updateSessionConfig(
        sessionId,
        {
          idleTimeoutMs,
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
          acpStatus: session.acpStatus,
        }}
        project={{
          id: project.id,
          name: project.name,
        }}
        creationSettings={{
          sessionName: session.name,
          assignedAgentName: assignedAgentName,
          agentSubpath: session.agentSubpath,
          localDevMirrorPath: session.localDevMirrorPath,
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

    try {
      // Update the session config
      await sessionRepository.updateSessionConfig(sessionId, { idleTimeoutMs });

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
              config: { idleTimeoutMs },
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

    const thread = await sessionRepository.addChatThread(sessionId, {
      name: body.name,
      model: body.model,
      mode: body.mode,
      acpSessionId: null,
      state: "active",
    });

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

  return router;
}
