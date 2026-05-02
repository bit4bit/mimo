/**
 * Test helper to create a complete app with both web routes and internal API.
 *
 * This mounts both the web routes and internal API on the same Hono app,
 * allowing the Internal API Client's fetch calls to be handled by the
 * mounted internal API routes during tests.
 *
 * @example
 * ```typescript
 * const { app, mimoContext } = await createTestApp({
 *   env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret" }
 * });
 *
 * // Make requests through web routes - fetch calls to /api/internal
 * // are handled by the mounted internal API
 * const res = await app.request("/agents", {
 *   headers: { Cookie: `token=${token}` }
 * });
 * ```
 */

import { Hono } from "hono";
import {
  createMimoContext,
  type MimoContext,
} from "../src/infrastructure/context/mimo-context.js";
import { createInternalApiRouter } from "../src/api/rest/index.js";
import { createAgentsRoutes } from "../src/web/features/agents/pages/agents.tsx";
import { createDashboardRoutes } from "../src/web/features/dashboard/pages/dashboard.tsx";
import { createCredentialsRoutes } from "../src/web/features/credentials/pages/credentials.tsx";
import { createProjectsRoutes } from "../src/web/features/projects/pages/projects.tsx";
import { createSessionsRoutes } from "../src/web/features/sessions/pages/sessions.tsx";
import { createConfigRoutes } from "../src/web/features/config/pages/config.tsx";
import { createMcpServerRoutes } from "../src/web/features/mcp-servers/pages/mcp-servers.tsx";
import { createSummaryRoutes } from "../src/web/features/summary/pages/summary.tsx";

export interface TestAppConfig {
  env: {
    MIMO_HOME: string;
    JWT_SECRET: string;
    PLATFORM_URL?: string;
    [key: string]: string | undefined;
  };
}

export interface TestApp {
  app: Hono;
  mimoContext: MimoContext;
}

export async function createTestApp(config: TestAppConfig): Promise<TestApp> {
  // Create MimoContext with PLATFORM_URL set to empty string
  // This allows fetch to use relative URLs which Hono handles
  const mimoContext = createMimoContext({
    env: {
      PLATFORM_URL: "", // Empty string makes fetch use relative URLs
      ...config.env,
    },
  });

  // Create main app
  const app = new Hono();

  // Mount internal API at /api/internal
  const internalRouter = createInternalApiRouter(mimoContext);
  app.route("/api/internal", internalRouter);

  // Mount web routes
  app.route("/agents", createAgentsRoutes(mimoContext));
  app.route("/dashboard", createDashboardRoutes(mimoContext));
  app.route("/credentials", createCredentialsRoutes(mimoContext));
  app.route("/projects", createProjectsRoutes(mimoContext));
  // Sessions routes are mounted under projects
  app.route("/sessions", createSessionsRoutes(mimoContext));
  app.route("/config", createConfigRoutes(mimoContext));
  app.route("/mcp-servers", createMcpServerRoutes(mimoContext));
  app.route("/summary", createSummaryRoutes(mimoContext));

  return { app, mimoContext };
}
