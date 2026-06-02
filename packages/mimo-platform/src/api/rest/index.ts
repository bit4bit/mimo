// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Internal API router factory.
 *
 * Creates and configures the internal API router with authentication
 * middleware, standardized responses, and service injection.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import { createInternalAuthMiddleware } from "./shared/auth.js";
import { successResponse } from "./shared/response.js";
import { createProjectsInternalRouter } from "./projects.js";
import { createSessionsInternalRouter } from "./sessions.js";
import { createAgentsInternalRouter } from "./agents.js";
import { createDashboardInternalRouter } from "./dashboard.js";
import { createCredentialsInternalRouter } from "./credentials.js";
import { createConfigInternalRouter } from "./config.js";
import { createMcpServersInternalRouter } from "./mcp-servers.js";
import { createSummaryInternalRouter } from "./summary.js";
import { createAuthInternalRouter } from "./auth.js";
import { createChatInternalRouter } from "./chat.js";
import {
  createInternalApiMigrationGateway,
  type MigrationGatewayOptions,
} from "./migration-gateway.js";

/**
 * Creates the internal API router with all routes and middleware.
 *
 * This factory function:
 * - Creates a new Hono router
 * - Applies JWT authentication middleware to all routes
 * - Injects MimoContext into the request context
 * - Registers the health check endpoint
 * - Returns the configured router ready to be mounted
 *
 * @param mimoContext - The MimoContext containing services and repositories
 * @returns Configured Hono router for internal API routes
 *
 * @example
 * ```typescript
 * const internalRouter = createInternalApiRouter(mimoContext);
 * app.route("/api/internal", internalRouter);
 * ```
 */
export function createInternalApiRouter(
  mimoContext: MimoContext,
  options: MigrationGatewayOptions = {},
): Hono {
  const router = new Hono();

  // Inject MimoContext into all requests
  router.use("/*", async (c, next) => {
    c.set("mimoContext", mimoContext);
    await next();
  });

  router.use("/*", createInternalApiMigrationGateway(mimoContext, options));

  // Mount auth internal API (no auth required for register/login/verify)
  router.route("/auth", createAuthInternalRouter(mimoContext));

  // Apply JWT authentication middleware to all other routes
  router.use("/*", createInternalAuthMiddleware(mimoContext));

  // Health check endpoint
  router.get("/health", (c) => {
    return c.json(
      successResponse({
        status: "healthy",
        timestamp: new Date().toISOString(),
      }),
    );
  });

  // Mount projects internal API
  router.route("/projects", createProjectsInternalRouter(mimoContext));

  // Mount sessions internal API
  router.route("/sessions", createSessionsInternalRouter(mimoContext));

  // Mount agents internal API
  router.route("/agents", createAgentsInternalRouter(mimoContext));

  // Mount dashboard internal API
  router.route("/dashboard", createDashboardInternalRouter(mimoContext));

  // Mount credentials internal API
  router.route("/credentials", createCredentialsInternalRouter(mimoContext));

  // Mount config internal API
  router.route("/config", createConfigInternalRouter(mimoContext));

  // Mount MCP servers internal API
  router.route("/mcp-servers", createMcpServersInternalRouter(mimoContext));

  // Mount summary internal API
  router.route("/summary", createSummaryInternalRouter(mimoContext));

  // Mount chat internal API
  router.route("/chat", createChatInternalRouter(mimoContext));

  return router;
}

// Re-export shared utilities for convenience
export { successResponse, errorResponse } from "./shared/response.js";
export type {
  SuccessResponse,
  ErrorResponse,
  ApiResponse,
} from "./shared/response.js";
export type { InternalApiContext, InternalApiHandler } from "./shared/types.js";
export { createInternalAuthMiddleware } from "./shared/auth.js";
export { createInternalApiClient } from "./shared/client.js";
export type {
  InternalApiClient,
  ApiResult,
  ApiSuccessResult,
  ApiErrorResult,
} from "./shared/client.js";
