import { Hono } from "hono";
import { DashboardPage } from "../components/DashboardPage.js";
import { createAuthMiddleware } from "../../auth/middleware.js";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import type { DashboardResponse } from "../../api/rest/dashboard/types.js";
import { createInternalApiClient } from "../../api/rest/index.js";

export function createDashboardRoutes(mimoContext: MimoContext): Hono {
  const dashboard = new Hono();
  const auth = createAuthMiddleware(mimoContext.services.auth);

  dashboard.use(auth);

  dashboard.get("/", async (c) => {
    const user = c.get("user") as { username: string };
    const username = user.username;

    // Use internal API client to fetch dashboard data
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.get<DashboardResponse>("/dashboard");

    if (!result.success) {
      return c.text(`Failed to load dashboard: ${result.error}`, result.status);
    }

    return c.html(
      <DashboardPage
        username={username}
        projects={result.data.projects}
        agents={result.data.agents}
        sessions={result.data.recentSessions}
      />,
    );
  });

  return dashboard;
}
