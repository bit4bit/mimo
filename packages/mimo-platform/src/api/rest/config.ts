// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Router setup for the config internal API.
 *
 * Defines routes for configuration operations.
 * Routes are mounted under /api/internal/config.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import {
  getConfigHandler,
  updateConfigHandler,
  resetConfigHandler,
} from "./config/handlers.js";

/**
 * Creates the config internal API router.
 *
 * Mounts all config-related endpoints under /api/internal/config.
 * Authentication is expected to be handled by parent router middleware.
 *
 * @param _mimoContext - The MimoContext (passed for consistency, unused directly)
 * @returns Configured Hono router for config endpoints
 */
export function createConfigInternalRouter(_mimoContext: MimoContext): Hono {
  const router = new Hono();

  // Get current configuration
  router.get("/", getConfigHandler);

  // Update configuration (validates first)
  router.put("/", updateConfigHandler);

  // Reset configuration to defaults
  router.post("/reset", resetConfigHandler);

  return router;
}
