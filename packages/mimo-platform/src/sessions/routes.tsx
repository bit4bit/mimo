import { Hono } from "hono";
import { sessionRepository } from "../sessions/repository";
import { chatService } from "../sessions/chat";
import { projectRepository } from "../projects/repository";
import { authMiddleware } from "../auth/middleware";
import { SessionListPage } from "../components/SessionListPage";
import { SessionDetailPage } from "../components/SessionDetailPage";
import { SessionCreatePage } from "../components/SessionCreatePage";

const sessions = new Hono();

// List sessions for a project (GET /projects/:projectId/sessions)
sessions.get("/", authMiddleware, async (c) => {
  const projectId = c.req.param("projectId");
  const user = c.get("user") as { username: string };

  // Verify project exists and belongs to user
  const project = await projectRepository.findById(projectId);
  if (!project || project.owner !== user.username) {
    return c.notFound();
  }

  const sessionsList = await sessionRepository.listByProject(projectId);
  return c.html(<SessionListPage project={project} sessions={sessionsList} />);
});

// Show create form (GET /projects/:projectId/sessions/new)
sessions.get("/new", authMiddleware, async (c) => {
  const projectId = c.req.param("projectId");
  const user = c.get("user") as { username: string };

  const project = await projectRepository.findById(projectId);
  if (!project || project.owner !== user.username) {
    return c.notFound();
  }

  return c.html(<SessionCreatePage project={project} />);
});

// Create session (POST /projects/:projectId/sessions)
sessions.post("/", authMiddleware, async (c) => {
  const projectId = c.req.param("projectId");
  const user = c.get("user") as { username: string };

  const project = await projectRepository.findById(projectId);
  if (!project || project.owner !== user.username) {
    return c.notFound();
  }

  const body = await c.req.parseBody();
  const name = body.name as string;

  if (!name) {
    return c.html(<SessionCreatePage project={project} error="Session name is required" />, 400);
  }

  const session = await sessionRepository.create({
    name,
    projectId,
    owner: user.username,
    worktreePath: "", // Will be set by repository
  });

  return c.redirect(`/projects/${projectId}/sessions/${session.id}`, 302);
});

// View session (GET /projects/:projectId/sessions/:id)
sessions.get("/:id", authMiddleware, async (c) => {
  const projectId = c.req.param("projectId");
  const sessionId = c.req.param("id");
  const user = c.get("user") as { username: string };

  const project = await projectRepository.findById(projectId);
  if (!project || project.owner !== user.username) {
    return c.notFound();
  }

  const session = await sessionRepository.findByProjectAndId(projectId, sessionId);
  if (!session) {
    return c.notFound();
  }

  const chatHistory = await chatService.loadHistory(sessionId);

  return c.html(
    <SessionDetailPage 
      project={project} 
      session={session} 
      chatHistory={chatHistory}
    />
  );
});

// Add chat message (POST /projects/:projectId/sessions/:id/chat)
sessions.post("/:id/chat", authMiddleware, async (c) => {
  const projectId = c.req.param("projectId");
  const sessionId = c.req.param("id");
  const user = c.get("user") as { username: string };

  const project = await projectRepository.findById(projectId);
  if (!project || project.owner !== user.username) {
    return c.notFound();
  }

  const session = await sessionRepository.findByProjectAndId(projectId, sessionId);
  if (!session) {
    return c.notFound();
  }

  const body = await c.req.parseBody();
  const message = body.message as string;

  if (message) {
    await chatService.saveMessage(sessionId, {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    });
  }

  return c.json({ success: true });
});

// Delete session (POST /projects/:projectId/sessions/:id/delete)
sessions.post("/:id/delete", authMiddleware, async (c) => {
  const projectId = c.req.param("projectId");
  const sessionId = c.req.param("id");
  const user = c.get("user") as { username: string };

  const project = await projectRepository.findById(projectId);
  if (!project || project.owner !== user.username) {
    return c.notFound();
  }

  const session = await sessionRepository.findByProjectAndId(projectId, sessionId);
  if (!session) {
    return c.notFound();
  }

  await sessionRepository.delete(projectId, sessionId);
  return c.redirect(`/projects/${projectId}/sessions`, 302);
});

// Get file tree (GET /projects/:projectId/sessions/:id/files)
sessions.get("/:id/files", authMiddleware, async (c) => {
  const projectId = c.req.param("projectId");
  const sessionId = c.req.param("id");
  const user = c.get("user") as { username: string };

  const project = await projectRepository.findById(projectId);
  if (!project || project.owner !== user.username) {
    return c.notFound();
  }

  const session = await sessionRepository.findByProjectAndId(projectId, sessionId);
  if (!session) {
    return c.notFound();
  }

  // Simple file listing
  const files = listFiles(session.worktreePath);

  return c.json({ files });
});

function listFiles(dirPath: string, prefix = ""): Array<{ path: string; type: "file" | "dir" }> {
  const { existsSync, readdirSync, statSync } = require("fs");
  const { join } = require("path");

  if (!existsSync(dirPath)) {
    return [];
  }

  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files: Array<{ path: string; type: "file" | "dir" }> = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // Skip hidden files

    const fullPath = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push({ path: fullPath, type: "dir" });
      files.push(...listFiles(join(dirPath, entry.name), fullPath));
    } else {
      files.push({ path: fullPath, type: "file" });
    }
  }

  return files;
}

export default sessions;
