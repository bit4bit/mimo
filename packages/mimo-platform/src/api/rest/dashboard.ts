/**
 * Router setup for the dashboard internal API.
 *
 * Defines routes for dashboard data aggregation.
 * Routes are mounted under /api/internal/dashboard.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import { getDashboardHandler } from "./dashboard/handlers.js";

/**
 * Creates the dashboard internal API router.
 *
 * Mounts the dashboard data endpoint under /api/internal/dashboard.
 * Authentication is expected to be handled by parent router middleware.
 *
 * @param _mimoContext - The MimoContext (passed for consistency, unused directly)
 * @returns Configured Hono router for dashboard endpoints
 */
export function createDashboardInternalRouter(_mimoContext: MimoContext): Hono {
  const router = new Hono();

  // Get dashboard data
  router.get("/", getDashboardHandler);

  return router;
}
