/**
 * Router setup for the MCP servers internal API.
 *
 * Defines routes for MCP server CRUD operations.
 * Routes are mounted under /api/internal/mcp-servers.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import {
  listMcpServersHandler,
  getMcpServerHandler,
  createMcpServerHandler,
  updateMcpServerHandler,
  deleteMcpServerHandler,
  validateDuplicateNamesHandler,
  resolveMcpServersHandler,
} from "./mcp-servers/handlers.js";

/**
 * Creates the MCP servers internal API router.
 *
 * Mounts all MCP server-related endpoints under /api/internal/mcp-servers.
 * Authentication is expected to be handled by parent router middleware.
 *
 * @param _mimoContext - The MimoContext (passed for consistency, unused directly)
 * @returns Configured Hono router for MCP servers endpoints
 */
export function createMcpServersInternalRouter(
  _mimoContext: MimoContext,
): Hono {
  const router = new Hono();

  // List all MCP servers
  router.get("/", listMcpServersHandler);

  // Create new MCP server
  router.post("/", createMcpServerHandler);

  // Get specific MCP server
  router.get("/:id", getMcpServerHandler);

  // Update MCP server
  router.put("/:id", updateMcpServerHandler);

  // Delete MCP server
  router.delete("/:id", deleteMcpServerHandler);

  // Validate duplicate MCP server names
  router.post("/validate-duplicates", validateDuplicateNamesHandler);

  // Resolve MCP servers by IDs
  router.post("/resolve", resolveMcpServersHandler);

  return router;
}
