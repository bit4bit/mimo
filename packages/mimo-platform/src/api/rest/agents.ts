// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Router setup for the agents internal API.
 *
 * Defines routes for agent CRUD operations and capabilities management.
 * Routes are mounted under /api/internal/agents.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import {
  listAgentsHandler,
  getAgentHandler,
  createAgentHandler,
  updateAgentHandler,
  deleteAgentHandler,
  getCapabilitiesHandler,
  refreshCapabilitiesHandler,
} from "./agents/handlers.js";

/**
 * Creates the agents internal API router.
 *
 * Mounts all agent-related endpoints under /api/internal/agents.
 * Authentication is expected to be handled by parent router middleware.
 *
 * @param _mimoContext - The MimoContext (passed for consistency, unused directly)
 * @returns Configured Hono router for agents endpoints
 */
export function createAgentsInternalRouter(_mimoContext: MimoContext): Hono {
  const router = new Hono();

  // List all agents
  router.get("/", listAgentsHandler);

  // Create new agent
  router.post("/", createAgentHandler);

  // Get specific agent
  router.get("/:id", getAgentHandler);

  // Update agent
  router.put("/:id", updateAgentHandler);

  // Delete agent
  router.delete("/:id", deleteAgentHandler);

  // Get agent capabilities
  router.get("/:id/capabilities", getCapabilitiesHandler);

  // Refresh agent capabilities
  router.post("/:id/capabilities/refresh", refreshCapabilitiesHandler);

  return router;
}
