/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { sessionRepository } from "./repository.js";
import { projectRepository } from "../projects/repository.js";
import { agentService } from "../agents/service.js";
import { chatService } from "./chat.js";
import { vcs } from "../vcs/index.js";
import { Layout } from "../components/Layout.js";
import { SessionDetailPage } from "../components/SessionDetailPage.js";
import { SessionCreatePage } from "../components/SessionCreatePage.js";
import { SessionListPage } from "../components/SessionListPage.js";
import type { Context } from "hono";

const router = new Hono();

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
  const username = getCookie(c, "username");
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
  const username = getCookie(c, "username");
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

  return c.html(
    <Layout title="New Session">
      <SessionCreatePage project={project} />
    </Layout>
  );
});

// POST /sessions or /projects/:projectId/sessions - Create new session
router.post("/", async (c: Context) => {
  const username = getCookie(c, "username");
  if (!username) {
    return c.redirect("/auth/login");
  }

  const body = await c.req.parseBody();
  const name = body.name as string;
  const projectId = (body.projectId as string) || getProjectId(c);

  if (!name || !projectId) {
    return c.text("Name and project ID required", 400);
  }

  const project = await projectRepository.findById(projectId);
  if (!project || project.owner !== username) {
    return c.text("Project not found", 404);
  }

  // Create session with worktree
  const session = await sessionRepository.create({
    name: name as string,
    projectId: projectId as string,
    owner: username,
    worktreePath: "", // Will be set by repository
  });

  // Initialize worktree from Fossil repository
  try {
    await vcs.setupSessionWorktree(projectId, session.id, session.worktreePath);
  } catch (error) {
    console.error("Failed to setup worktree:", error);
    // Don't fail - user can still see the session
  }

  return c.redirect(`/projects/${projectId}/sessions/${session.id}`);
});

// GET /sessions/:id or /projects/:projectId/sessions/:id - View session detail
router.get("/:id", async (c: Context) => {
  const username = getCookie(c, "username");
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
  
  // Get agent status
  const agents = await agentService.listAgentsBySession(sessionId);
  const activeAgent = agents.find(a => a.status === "connected");

  return c.html(
    <Layout title={session.name}>
      <SessionDetailPage 
        session={session}
        project={project}
        chatHistory={chatHistory}
        activeAgent={activeAgent}
      />
    </Layout>
  );
});

// POST /sessions/:id/agent or /projects/:projectId/sessions/:id/agent - Spawn an agent
router.post("/:id/agent", async (c: Context) => {
  const username = getCookie(c, "username");
  if (!username) {
    return c.redirect("/auth/login");
  }

  const sessionId = c.req.param("id");
  const session = await sessionRepository.findById(sessionId);
  
  if (!session || session.owner !== username) {
    return c.text("Session not found", 404);
  }

  // Check if there's already an active agent
  const existingAgents = await agentService.listAgentsBySession(sessionId);
  const activeAgent = existingAgents.find(a => a.status === "connected" || a.status === "starting");
  
  if (activeAgent) {
    return c.redirect(`/sessions/${sessionId}`);
  }

  try {
    await agentService.spawnAgent({
      sessionId,
      projectId: session.projectId,
      owner: username,
    });
  } catch (error) {
    console.error("Failed to spawn agent:", error);
    // Error is handled by service - it updates status and adds chat message
  }

  return c.redirect(`/projects/${session.projectId}/sessions/${sessionId}`);
});

// POST /sessions/:id/cancel - Cancel current ACP request
router.post("/:id/cancel", async (c: Context) => {
  const username = getCookie(c, "username");
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
  const username = getCookie(c, "username");
  if (!username) {
    return c.redirect("/auth/login");
  }

  const sessionId = c.req.param("id");
  const session = await sessionRepository.findById(sessionId);
  
  if (!session || session.owner !== username) {
    return c.text("Session not found", 404);
  }

  // Kill any active agents
  await agentService.killAgentsBySession(sessionId);

  // Delete session
  await sessionRepository.delete(session.projectId, sessionId);

  return c.redirect(`/projects/${session.projectId}/sessions`);
});

export default router;
