import { McpServerRepository, mcpServerRepository } from "./repository.js";
import { McpServer, CreateMcpServerInput, UpdateMcpServerInput, McpServerConfig, slugify } from "./types.js";

export class McpServerService {
  constructor(
    private repository: McpServerRepository = mcpServerRepository
  ) {}

  async create(input: CreateMcpServerInput): Promise<McpServer> {
    // Validation: name required
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Name is required");
    }

    // Validation: transport required
    if (!input.transport) {
      throw new Error("Transport type is required");
    }

    // Validation based on transport type
    if (input.transport === "stdio") {
      if (!input.command || input.command.trim().length === 0) {
        throw new Error("Command is required for stdio transport");
      }
    } else {
      // HTTP or SSE transport
      if (!input.url || input.url.trim().length === 0) {
        throw new Error("URL is required for HTTP/SSE transport");
      }
    }

    // Validation: name uniqueness check
    const { slugify } = await import("./types.js");
    const id = slugify(input.name);
    const exists = await this.repository.exists(id);
    if (exists) {
      throw new Error(`MCP server with name '${input.name}' already exists`);
    }

    return this.repository.create({
      name: input.name.trim(),
      description: input.description?.trim(),
      transport: input.transport,
      ...(input.transport === "stdio" ? {
        command: input.command!.trim(),
        args: input.args || [],
      } : {
        url: input.url!.trim(),
        headers: input.headers,
      }),
    });
  }

  async findById(id: string): Promise<McpServer | null> {
    return this.repository.findById(id);
  }

  async findAll(): Promise<McpServer[]> {
    return this.repository.findAll();
  }

  async update(id: string, input: UpdateMcpServerInput): Promise<McpServer | null> {
    // If name is being updated, validate it's not empty and check uniqueness
    if (input.name !== undefined) {
      if (input.name.trim().length === 0) {
        throw new Error("Name is required");
      }

      // Get existing to check if name actually changed
      const existing = await this.repository.findById(id);
      if (existing && existing.name !== input.name.trim()) {
        const { slugify } = await import("./types.js");
        const newId = slugify(input.name);
        const idExists = await this.repository.exists(newId);
        if (idExists && newId !== id) {
          throw new Error(`MCP server with name '${input.name}' already exists`);
        }
      }
    }

    // Validate transport-specific fields
    if (input.transport !== undefined) {
      if (input.transport === "stdio") {
        if (input.command !== undefined && input.command.trim().length === 0) {
          throw new Error("Command is required for stdio transport");
        }
      } else {
        if (input.url !== undefined && input.url.trim().length === 0) {
          throw new Error("URL is required for HTTP/SSE transport");
        }
      }
    }

    return this.repository.update(id, {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && { description: input.description?.trim() }),
      ...(input.transport !== undefined && { transport: input.transport }),
      ...(input.command !== undefined && { command: input.command.trim() }),
      ...(input.args !== undefined && { args: input.args }),
      ...(input.url !== undefined && { url: input.url.trim() }),
      ...(input.headers !== undefined && { headers: input.headers }),
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  /**
   * Resolve MCP server IDs to full configurations
   * Used by session bootstrap to send configs to agent
   */
  async resolveMcpServers(ids: string[]): Promise<McpServerConfig[]> {
    const configs: McpServerConfig[] = [];

    for (const id of ids) {
      const server = await this.repository.findById(id);
      if (!server) {
        throw new Error(`MCP server '${id}' not found`);
      }

      if (server.transport === "stdio") {
        // Stdio transport - no 'type' field
        configs.push({
          name: server.name,
          command: server.command!,
          args: server.args || [],
        });
      } else if (server.transport === "http") {
        // HTTP transport - requires 'type: "http"'
        configs.push({
          type: "http",
          name: server.name,
          url: server.url!,
          headers: server.headers ? Object.entries(server.headers).map(([name, value]) => ({ name, value })) : [],
        });
      } else if (server.transport === "sse") {
        // SSE transport - requires 'type: "sse"'
        configs.push({
          type: "sse",
          name: server.name,
          url: server.url!,
          headers: server.headers ? Object.entries(server.headers).map(([name, value]) => ({ name, value })) : [],
        });
      }
    }

    return configs;
  }

  /**
   * Check for duplicate MCP server names within a list of IDs
   * Returns the duplicate name if found, null otherwise
   */
  async findDuplicateNames(ids: string[]): Promise<string | null> {
    const names = new Set<string>();

    for (const id of ids) {
      const server = await this.repository.findById(id);
      if (server) {
        if (names.has(server.name)) {
          return server.name;
        }
        names.add(server.name);
      }
    }

    return null;
  }
}

export const mcpServerService = new McpServerService();
