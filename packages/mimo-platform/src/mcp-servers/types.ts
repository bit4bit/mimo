export interface McpServer {
  id: string;
  name: string;
  description?: string;
  command: string;
  args: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface McpServerData {
  id: string;
  name: string;
  description?: string;
  command: string;
  args: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMcpServerInput {
  name: string;
  description?: string;
  command: string;
  args: string[];
}

export interface UpdateMcpServerInput {
  name?: string;
  description?: string;
  command?: string;
  args?: string[];
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
 * Matches ACP SDK McpServerStdio type (without required env)
 */
export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Array<{ name: string; value: string }>;
}
