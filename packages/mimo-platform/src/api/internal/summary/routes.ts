/**
 * Router setup for the summary internal API.
 *
 * Defines routes for summary operations (refresh and latest).
 * Routes are mounted under /api/internal/summary.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../../context/mimo-context.js";
import {
  refreshSummaryHandler,
  getLatestSummaryHandler,
} from "./handlers.js";

/**
 * Creates the summary internal API router.
 *
 * Mounts all summary-related endpoints under /api/internal/summary.
 * Authentication is expected to be handled by parent router middleware.
 *
 * @param _mimoContext - The MimoContext (passed for consistency, unused directly)
 * @returns Configured Hono router for summary endpoints
 */
export function createSummaryInternalRouter(_mimoContext: MimoContext): Hono {
  const router = new Hono();

  // Refresh/generate a summary
  router.post("/refresh", refreshSummaryHandler);

  // Get the latest summary
  router.get("/latest", getLatestSummaryHandler);

  return router;
}
