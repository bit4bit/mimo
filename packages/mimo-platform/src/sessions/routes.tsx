/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import crypto from "crypto";
import { sessionRepository } from "./repository.js";
import { projectRepository } from "../projects/repository.js";
import { agentRepository } from "../agents/repository.js";
import { agentService } from "../agents/service.js";
import { chatService } from "./chat.js";
import { vcs } from "../vcs/index.js";
import { verifyToken } from "../auth/jwt.js";

import { SessionDetailPage } from "../components/SessionDetailPage.js";
import { SessionCreatePage } from "../components/SessionCreatePage.js";
import { SessionListPage } from "../components/SessionListPage.js";
import { sessionStateService } from "./state.js";
import { fossilServerManager } from "../vcs/fossil-server.js";
import type { Context } from "hono";

const router = new Hono();

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
    const payload = await verifyToken(token);
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

  return c.html(
    <SessionListPage project={project} sessions={sessions} />
  );
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

  return c.html(
    <SessionCreatePage project={project} agents={agents} />
  );
});

// POST /sessions or /projects/:projectId/sessions - Create new session
router.post("/", async (c: Context) => {
  const username = await getAuthUsername(c);
  if (!username) {
    return c.redirect("/auth/login");
  }

  const body = await c.req.parseBody();
  const name = body.name as string;
  const projectId = (body.projectId as string) || getProjectId(c);
  const assignedAgentId = (body.assignedAgentId as string) || null;
  const localDevMirrorPath = (body.localDevMirrorPath as string) || null;

  if (!name || !projectId) {
    return c.text("Name and project ID required", 400);
  }

  const project = await projectRepository.findById(projectId);
  if (!project || project.owner !== username) {
    return c.text("Project not found", 404);
  }

  // Create session with upstream and checkout directories
  const session = await sessionRepository.create({
    name: name as string,
    projectId: projectId as string,
    owner: username,
    assignedAgentId: assignedAgentId || undefined,
    localDevMirrorPath: localDevMirrorPath || undefined,
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
      project.sourceBranch
    );
    
    if (!cloneResult.success) {
      await sessionRepository.delete(projectId, session.id);
      return c.text(`Failed to clone repository: ${cloneResult.error}`, 500);
    }

    // Step 2: Import to fossil proxy (repo.fossil)
    const fossilPath = `${session.upstreamPath}/../repo.fossil`;
    const importResult = await vcs.importToFossil(
      session.upstreamPath,
      project.repoType,
      fossilPath
    );
    
    if (!importResult.success) {
      await sessionRepository.delete(projectId, session.id);
      return c.text(`Failed to import to fossil: ${importResult.error}`, 500);
    }

    // Step 3: Create new branch if specified (after Fossil import is complete)
    if (project.newBranch) {
      const branchResult = await vcs.createBranch(
        project.newBranch,
        project.repoType,
        session.upstreamPath
      );
      if (!branchResult.success) {
        await sessionRepository.delete(projectId, session.id);
        return c.text(`Failed to create branch '${project.newBranch}': ${branchResult.error}`, 500);
      }
    }

    // Step 4: Create fossil user for agent access
    const agentWorkspaceUser = `agent-${session.id.slice(0, 8)}`;
    const agentWorkspacePassword = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const userResult = await vcs.createFossilUser(fossilPath, agentWorkspaceUser, agentWorkspacePassword);
    
    if (!userResult.success) {
      console.error("[session] Failed to create fossil user:", userResult.error);
      // Non-fatal - session can still work, just log the error
    }
    
    // Save credentials to session
    await sessionRepository.update(session.id, {
      agentWorkspaceUser,
      agentWorkspacePassword,
    });
    
    // Step 5: Open fossil checkout in agent-workspace
    const openResult = await vcs.openFossil(fossilPath, session.agentWorkspacePath);
    if (!openResult.success) {
      console.error("[session] Failed to open fossil in agent-workspace:", openResult.error);
      await sessionRepository.delete(projectId, session.id);
      return c.text("Failed to open fossil checkout", 500);
    }
  } catch (error) {
    console.error("Failed to setup session:", error);
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

  // Get chat history
  const chatHistory = await chatService.loadHistory(sessionId);
  
  // Get assigned agent if any
  let agent = undefined;
  if (session.assignedAgentId) {
    agent = await agentRepository.findById(session.assignedAgentId);
  }

  // Get model/mode state from in-memory store
  const modelState = sessionStateService.getModelState(sessionId);
  const modeState = sessionStateService.getModeState(sessionId);

  // Get fossil port for impact buffer links
  // First check running server in memory, then fall back to saved session port
  const runningServer = fossilServerManager.getRunningServer(sessionId);
  const fossilPort = runningServer?.port ?? session.port ?? undefined;

  return c.html(
    <SessionDetailPage 
      session={session}
      project={project}
      chatHistory={chatHistory}
      agent={agent}
      modelState={modelState}
      modeState={modeState}
      fossilPort={fossilPort}
    />
  );
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

  // Delete session (agent is independent, not affected)
  await sessionRepository.delete(session.projectId, sessionId);

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
    console.error("Error scanning checkout:", error);
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

  await chatService.saveMessage(sessionId, {
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  });

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
    const { impactCalculator } = await import("../impact/calculator.js");
    const { getSccService } = await import("../impact/scc-service.js");
    const { vcs } = await import("../vcs/index.js");

    // Sync agent-workspace with repo.fossil before calculating impact
    const fossilPath = `${session.upstreamPath}/../repo.fossil`;
    const { existsSync } = await import("fs");
    const { join } = await import("path");
    const fslckoutPath = join(session.agentWorkspacePath, ".fslckout");
    
    if (existsSync(fossilPath)) {
      if (!existsSync(fslckoutPath)) {
        // Initialize fossil checkout if not exists
        console.log(`[impact] Initializing fossil checkout in agent-workspace...`);
        await vcs.openFossil(fossilPath, session.agentWorkspacePath);
      }
      // Sync with repo.fossil to get latest changes from agent
      console.log(`[impact] Syncing agent-workspace with repo.fossil...`);
      await vcs.fossilUp(session.agentWorkspacePath);
    }

    // Check if scc is installed - use getter to avoid TDZ issues
    const sccService = getSccService();
    const sccInstalled = sccService.isInstalled();

    if (!sccInstalled) {
      // Return basic file counts without complexity
      const { readdirSync, statSync, readFileSync } = await import("fs");
      const { join, relative } = await import("path");
      const crypto = await import("crypto");

      const scanDir = (dir: string, baseDir: string, files: Map<string, { checksum: string; size: number }>) => {
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
            const checksum = crypto.createHash("md5").update(content).digest("hex");
            files.set(relPath, { checksum, size: stats.size });
          }
        }
      };

      const upstreamFiles = new Map<string, { checksum: string; size: number }>();
      const workspaceFiles = new Map<string, { checksum: string; size: number }>();

      scanDir(session.upstreamPath, session.upstreamPath, upstreamFiles);
      scanDir(session.agentWorkspacePath, session.agentWorkspacePath, workspaceFiles);

      let newCount = 0, changedCount = 0, deletedCount = 0;

      for (const [path, info] of workspaceFiles) {
        if (!upstreamFiles.has(path)) newCount++;
        else if (upstreamFiles.get(path)?.checksum !== info.checksum) changedCount++;
      }

      for (const [path] of upstreamFiles) {
        if (!workspaceFiles.has(path)) deletedCount++;
      }

      return c.json({
        files: { new: newCount, changed: changedCount, deleted: deletedCount },
        sccInstalled: false,
        warning: "scc not installed - complexity metrics unavailable",
      });
    }

    // Calculate full impact with complexity
    const result = await impactCalculator.calculateImpact(
      sessionId,
      session.upstreamPath,
      session.agentWorkspacePath
    );

    return c.json({
      ...result,
      sccInstalled: true,
    });
  } catch (error) {
    console.error("[impact] Failed to calculate impact:", error);
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

  // Check running server first, then fall back to saved session port
  const runningServer = fossilServerManager.getRunningServer(sessionId);
  const fossilPort = runningServer?.port ?? session.port ?? null;

  if (fossilPort) {
    return c.json({
      running: true,
      fossilUrl: `http://localhost:${fossilPort}`,
    });
  }

  return c.json({
    running: false,
    fossilUrl: null,
  });
});

export default router;
