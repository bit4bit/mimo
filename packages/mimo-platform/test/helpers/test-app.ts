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
} from "../src/context/mimo-context.js";
import { createInternalApiRouter } from "../src/api/internal/index.js";
import { createAgentsRoutes } from "../src/agents/routes.tsx";
import { createDashboardRoutes } from "../src/dashboard/routes.tsx";
import { createCredentialsRoutes } from "../src/credentials/routes.tsx";
import { createProjectsRoutes } from "../src/projects/routes.tsx";
import { createSessionsRoutes } from "../src/sessions/routes.tsx";
import { createConfigRoutes } from "../src/config/routes.tsx";
import { createMcpServerRoutes } from "../src/mcp-servers/routes.tsx";
import { createSummaryRoutes } from "../src/summary/routes.tsx";

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
