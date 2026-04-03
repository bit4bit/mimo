import { Hono } from "hono";
import { DashboardPage } from "../components/DashboardPage.js";
import { authMiddleware } from "../auth/middleware.js";
import { projectRepository } from "../projects/repository.js";
import { agentRepository } from "../agents/repository.js";
import { sessionRepository } from "../sessions/repository.js";

const dashboard = new Hono();

dashboard.use(authMiddleware);

dashboard.get("/", async (c) => {
  const user = c.get("user") as { username: string };
  const username = user.username;

  // Get user's projects
  const projects = await projectRepository.listByOwner(username);

  // Get user's agents
  const agents = await agentRepository.findByOwner(username);

  // Get all sessions across all projects
  const allSessions: any[] = [];
  for (const project of projects) {
    const sessions = await sessionRepository.listByProject(project.id);
    allSessions.push(...sessions);
  }

  // Sort sessions by creation date descending
  allSessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return c.html(
    <DashboardPage
      username={username}
      projects={projects}
      agents={agents}
      sessions={allSessions.slice(0, 10)}
    />
  );
});

export default dashboard;