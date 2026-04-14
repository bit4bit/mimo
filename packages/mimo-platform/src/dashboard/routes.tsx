import { Hono } from "hono";
import { DashboardPage } from "../components/DashboardPage.js";
import { authMiddleware } from "../auth/middleware.js";
import type { MimoContext } from "../context/mimo-context.js";

export function createDashboardRoutes(mimoContext: MimoContext): Hono {
  const projects = mimoContext.repos.projects;
  const agents = mimoContext.repos.agents;
  const sessions = mimoContext.repos.sessions;

  const dashboard = new Hono();

  dashboard.use(authMiddleware);

  dashboard.get("/", async (c) => {
    const user = c.get("user") as { username: string };
    const username = user.username;

    // Get user's projects
    const userProjects = await projects.listByOwner(username);

    // Get user's agents
    const userAgents = await agents.findByOwner(username);

    // Get all sessions across all projects
    const allSessions: any[] = [];
    for (const project of userProjects) {
      const projectSessions = await sessions.listByProject(project.id);
      allSessions.push(...projectSessions);
    }

    // Sort sessions by creation date descending
    allSessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return c.html(
      <DashboardPage
        username={username}
        projects={userProjects}
        agents={userAgents}
        sessions={allSessions.slice(0, 10)}
      />
    );
  });

  return dashboard;
}