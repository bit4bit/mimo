/**
 * Request handlers for the dashboard internal API.
 *
 * Provides a single endpoint that aggregates dashboard data from
 * multiple sources (projects, agents, sessions).
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import {
  toDashboardProject,
  toDashboardAgent,
  toDashboardSession,
} from "./types.js";

/**
 * Get dashboard data for the authenticated user.
 * GET /api/internal/dashboard
 *
 * Aggregates projects, agents, and recent sessions into a single
 * response for the dashboard page.
 */
export async function getDashboardHandler(c: InternalApiContext) {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");

  // Get user's projects
  const userProjects = await mimoContext.repos.projects.listByOwner(user.username);

  // Get user's agents
  const userAgents = await mimoContext.repos.agents.findByOwner(user.username);

  // Get all sessions across all projects
  const allSessions: any[] = [];
  for (const project of userProjects) {
    const projectSessions = await mimoContext.repos.sessions.listByProject(project.id);
    allSessions.push(...projectSessions);
  }

  // Sort sessions by creation date descending
  allSessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Take the 10 most recent sessions
  const recentSessions = allSessions.slice(0, 10);

  // Calculate stats
  const totalProjects = userProjects.length;
  const totalAgents = userAgents.length;
  const onlineAgents = userAgents.filter((a: { status: string }) => a.status === "online").length;
  const offlineAgents = userAgents.filter((a: { status: string }) => a.status === "offline").length;
  const activeSessions = allSessions.filter((s) => s.status === "active").length;

  // Transform data for dashboard
  const dashboardData = {
    projects: userProjects.map(toDashboardProject),
    agents: userAgents.map(toDashboardAgent),
    recentSessions: recentSessions.map(toDashboardSession),
    stats: {
      totalProjects,
      totalAgents,
      onlineAgents,
      offlineAgents,
      activeSessions,
    },
  };

  return c.json(successResponse(dashboardData));
}
