/**
 * Request and response types for the MCP servers internal API.
 *
 * These types define the data contracts for all MCP server-related
 * endpoints in the internal API.
 */

import type { McpServer, TransportType } from "../../../domain/mcp-servers/types.js";

/**
 * MCP server response format for API serialization.
 * Dates are serialized as ISO strings.
 */
export interface McpServerResponse {
  id: string;
  name: string;
  description?: string;
  transport: TransportType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new MCP server.
 */
export interface CreateMcpServerRequest {
  name: string;
  description?: string;
  transport: TransportType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Request body for updating an MCP server.
 */
export interface UpdateMcpServerRequest {
  name?: string;
  description?: string;
  transport?: TransportType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
}

/**
 * List MCP servers response.
 */
export interface ListMcpServersResponse {
  servers: McpServerResponse[];
}

/**
 * Get MCP server response.
 */
export interface GetMcpServerResponse {
  server: McpServerResponse;
}

/**
 * Create MCP server response.
 */
export interface CreateMcpServerResponse {
  server: McpServerResponse;
}

/**
 * Update MCP server response.
 */
export interface UpdateMcpServerResponse {
  server: McpServerResponse;
}

/**
 * Delete MCP server response.
 */
export interface DeleteMcpServerResponse {
  success: boolean;
}

/**
 * Converts an McpServer entity to API response format.
 */
export function toMcpServerResponse(server: McpServer): McpServerResponse {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
    headers: server.headers,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
  };
}
