/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { sessionRepository } from "./repository.js";
import { projectRepository } from "../projects/repository.js";
import { agentRepository } from "../agents/repository.js";
import { agentService } from "../agents/service.js";
import { chatService } from "./chat.js";
import { vcs } from "../vcs/index.js";
import { verifyToken } from "../auth/jwt.js";
import { Layout } from "../components/Layout.js";
import { SessionDetailPage } from "../components/SessionDetailPage.js";
import { SessionCreatePage } from "../components/SessionCreatePage.js";
import { SessionListPage } from "../components/SessionListPage.js";
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
    <Layout title={`Sessions - ${project.name}`}>
      <SessionListPage project={project} sessions={sessions} />
    </Layout>
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
    <Layout title="New Session">
      <SessionCreatePage project={project} agents={agents} />
    </Layout>
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
  });

  // Initialize repository: clone → import to fossil → open checkout
  try {
    // Step 1: Clone repository to upstream/
    const cloneResult = await vcs.cloneRepository(
      project.repoUrl,
      project.repoType,
      session.upstreamPath
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

    // Step 3: Open fossil checkout
    const checkoutResult = await vcs.openFossilCheckout(
      fossilPath,
      session.checkoutPath
    );
    
    if (!checkoutResult.success) {
      await sessionRepository.delete(projectId, session.id);
      return c.text(`Failed to open checkout: ${checkoutResult.error}`, 500);
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

  // Get file changes
  const { fileSyncService } = await import("../sync/service.js");
  const changeSet = await fileSyncService.getChangeSet(sessionId);
  const hasConflicts = changeSet.hasConflicts;

  return c.html(
    <SessionDetailPage 
      session={session}
      project={project}
      chatHistory={chatHistory}
      agent={agent}
      changes={changeSet.files}
      hasConflicts={hasConflicts}
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
    scanDir(session.checkoutPath, session.checkoutPath);
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

export default router;
