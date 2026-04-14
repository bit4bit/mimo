export type TransportType = "stdio" | "http" | "sse";

export interface McpServer {
  id: string;
  name: string;
  description?: string;
  transport: TransportType;
  // For stdio transport
  command?: string;
  args?: string[];
  // For HTTP/SSE transport
  url?: string;
  headers?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface McpServerData {
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

export interface CreateMcpServerInput {
  name: string;
  description?: string;
  transport: TransportType;
  // For stdio transport
  command?: string;
  args?: string[];
  // For HTTP/SSE transport
  url?: string;
  headers?: Record<string, string>;
}

export interface UpdateMcpServerInput {
  name?: string;
  description?: string;
  transport?: TransportType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Convert a display name to a URL-safe ID
 * Examples:
 *   "Filesystem" -> "filesystem"
 *   "GitHub API" -> "github-api"
 *   "PostgreSQL DB" -> "postgresql-db"
 *   "My   Server" -> "my-server"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_]+/g, '-')   // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-');      // Collapse multiple hyphens
}

/**
 * MCP server configuration as sent to agent and ACP
 * Matches ACP SDK McpServer type exactly
 */
export type McpServerConfig =
  | {
      // Stdio transport - no type field
      name: string;
      command: string;
      args: string[];
      env?: Array<{ name: string; value: string }>;
    }
  | {
      // HTTP transport
      type: "http";
      name: string;
      url: string;
      headers?: Array<{ name: string; value: string }>;
    }
  | {
      // SSE transport
      type: "sse";
      name: string;
      url: string;
      headers?: Array<{ name: string; value: string }>;
    };
