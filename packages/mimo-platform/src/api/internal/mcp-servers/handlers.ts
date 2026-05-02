/**
 * Request handlers for the MCP servers internal API.
 *
 * Provides CRUD operations for MCP servers.
 * All handlers are pure functions that operate on injected dependencies.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type {
  CreateMcpServerRequest,
  UpdateMcpServerRequest,
} from "./types.js";
import { toMcpServerResponse } from "./types.js";

/**
 * List all MCP servers.
 * GET /api/internal/mcp-servers
 */
export async function listMcpServersHandler(c: InternalApiContext): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const servers = await mimoContext.services.mcpServer.findAll();

  return c.json(
    successResponse({
      servers: servers.map(toMcpServerResponse),
    }),
  );
}

/**
 * Get a specific MCP server by ID.
 * GET /api/internal/mcp-servers/:id
 */
export async function getMcpServerHandler(c: InternalApiContext): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("MCP server ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const server = await mimoContext.services.mcpServer.findById(id);

  if (!server) {
    return c.json(errorResponse("MCP server not found", 404), 404);
  }

  return c.json(
    successResponse({
      server: toMcpServerResponse(server),
    }),
  );
}

/**
 * Create a new MCP server.
 * POST /api/internal/mcp-servers
 */
export async function createMcpServerHandler(c: InternalApiContext): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const body = await c.req.json() as CreateMcpServerRequest;

  // Validate required fields
  if (!body.name || body.name.trim().length === 0) {
    return c.json(errorResponse("Name is required", 400), 400);
  }

  if (!body.transport) {
    return c.json(errorResponse("Transport type is required", 400), 400);
  }

  // Validate transport type first
  if (body.transport !== "stdio" && body.transport !== "http" && body.transport !== "sse") {
    return c.json(errorResponse("Transport type is required", 400), 400);
  }

  // Validate transport-specific fields
  if (body.transport === "stdio") {
    if (!body.command || body.command.trim().length === 0) {
      return c.json(errorResponse("Command is required for stdio transport", 400), 400);
    }
  } else if (body.transport === "http" || body.transport === "sse") {
    if (!body.url || body.url.trim().length === 0) {
      return c.json(errorResponse("URL is required for HTTP/SSE transport", 400), 400);
    }
  }

  try {
    const server = await mimoContext.services.mcpServer.create({
      name: body.name.trim(),
      description: body.description?.trim(),
      transport: body.transport,
      command: body.command?.trim(),
      args: body.args,
      url: body.url?.trim(),
      headers: body.headers,
    });

    return c.json(
      successResponse({
        server: toMcpServerResponse(server),
      }),
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create MCP server";
    return c.json(errorResponse(message, 400), 400);
  }
}

/**
 * Update an MCP server.
 * PUT /api/internal/mcp-servers/:id
 */
export async function updateMcpServerHandler(c: InternalApiContext): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("MCP server ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const body = await c.req.json() as UpdateMcpServerRequest;

  // Validate name if provided
  if (body.name !== undefined && body.name.trim().length === 0) {
    return c.json(errorResponse("Name cannot be empty", 400), 400);
  }

  // Validate transport-specific fields
  if (body.transport !== undefined) {
    if (body.transport === "stdio") {
      if (body.command !== undefined && body.command.trim().length === 0) {
        return c.json(errorResponse("Command is required for stdio transport", 400), 400);
      }
    } else if (body.transport === "http" || body.transport === "sse") {
      if (body.url !== undefined && body.url.trim().length === 0) {
        return c.json(errorResponse("URL is required for HTTP/SSE transport", 400), 400);
      }
    }
  }

  try {
    const server = await mimoContext.services.mcpServer.update(id, {
      name: body.name?.trim(),
      description: body.description?.trim(),
      transport: body.transport,
      command: body.command?.trim(),
      args: body.args,
      url: body.url?.trim(),
      headers: body.headers,
    });

    if (!server) {
      return c.json(errorResponse("MCP server not found", 404), 404);
    }

    return c.json(
      successResponse({
        server: toMcpServerResponse(server),
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update MCP server";
    return c.json(errorResponse(message, 400), 400);
  }
}

/**
 * Delete an MCP server.
 * DELETE /api/internal/mcp-servers/:id
 */
export async function deleteMcpServerHandler(c: InternalApiContext): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("MCP server ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const result = await mimoContext.services.mcpServer.delete(id);

  if (!result) {
    return c.json(errorResponse("MCP server not found", 404), 404);
  }

  return c.json(successResponse({ success: true }));
}

/**
 * Validate duplicate MCP server names for a list of IDs.
 * POST /api/internal/mcp-servers/validate-duplicates
 */
export async function validateDuplicateNamesHandler(c: InternalApiContext): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const body = await c.req.json() as { ids: string[] };
  if (!body.ids || !Array.isArray(body.ids)) {
    return c.json(errorResponse("ids array is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const duplicateName = await mimoContext.services.mcpServer.findDuplicateNames(body.ids);

  return c.json(
    successResponse({
      duplicateName: duplicateName || null,
    }),
  );
}

/**
 * Resolve MCP servers by their IDs.
 * POST /api/internal/mcp-servers/resolve
 */
export async function resolveMcpServersHandler(c: InternalApiContext): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const body = await c.req.json() as { ids: string[] };
  if (!body.ids || !Array.isArray(body.ids)) {
    return c.json(errorResponse("ids array is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  try {
    const servers = await mimoContext.services.mcpServer.resolveMcpServers(body.ids);
    return c.json(
      successResponse({
        servers,
      }),
    );
  } catch (error) {
    return c.json(errorResponse("Failed to resolve MCP servers", 500), 500);
  }
}
