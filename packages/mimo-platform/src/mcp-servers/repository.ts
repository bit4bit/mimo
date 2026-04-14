import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "fs";
import { dump, load } from "js-yaml";
import { getPaths } from "../config/paths.js";
import { McpServer, McpServerData, CreateMcpServerInput, UpdateMcpServerInput, slugify } from "./types.js";

export class McpServerRepository {
  private getMcpServersPath(): string {
    return join(getPaths().root, "mcp-servers");
  }

  private getMcpServerPath(id: string): string {
    return join(this.getMcpServersPath(), id);
  }

  private getMcpServerConfigPath(id: string): string {
    return join(this.getMcpServerPath(id), "config.yaml");
  }

  private ensureMcpServersDir(): void {
    const path = this.getMcpServersPath();
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }

  async create(input: CreateMcpServerInput): Promise<McpServer> {
    this.ensureMcpServersDir();

    const id = slugify(input.name);
    const mcpServerPath = this.getMcpServerPath(id);

    // Check if already exists
    if (existsSync(mcpServerPath)) {
      throw new Error(`MCP server with name '${input.name}' already exists`);
    }

    // Create directory
    mkdirSync(mcpServerPath, { recursive: true });

    const now = new Date().toISOString();
    const mcpServerData: McpServerData = {
      id,
      name: input.name,
      description: input.description,
      command: input.command,
      args: input.args,
      createdAt: now,
      updatedAt: now,
    };

    writeFileSync(
      this.getMcpServerConfigPath(id),
      dump(mcpServerData),
      "utf-8"
    );

    return {
      ...mcpServerData,
      createdAt: new Date(mcpServerData.createdAt),
      updatedAt: new Date(mcpServerData.updatedAt),
    };
  }

  async findById(id: string): Promise<McpServer | null> {
    const configPath = this.getMcpServerConfigPath(id);
    if (!existsSync(configPath)) {
      return null;
    }

    const content = readFileSync(configPath, "utf-8");
    const data = load(content) as McpServerData;

    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
  }

  async findAll(): Promise<McpServer[]> {
    const mcpServersPath = this.getMcpServersPath();
    if (!existsSync(mcpServersPath)) {
      return [];
    }

    const entries = readdirSync(mcpServersPath, { withFileTypes: true });
    const servers: McpServer[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const configPath = this.getMcpServerConfigPath(entry.name);
        if (existsSync(configPath)) {
          const content = readFileSync(configPath, "utf-8");
          const data = load(content) as McpServerData;
          servers.push({
            ...data,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
          });
        }
      }
    }

    return servers.sort((a, b) => a.name.localeCompare(b.name));
  }

  async update(id: string, input: UpdateMcpServerInput): Promise<McpServer | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updatedData: McpServerData = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.command !== undefined && { command: input.command }),
      ...(input.args !== undefined && { args: input.args }),
      id, // ID is immutable
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(
      this.getMcpServerConfigPath(id),
      dump(updatedData),
      "utf-8"
    );

    return {
      ...updatedData,
      createdAt: new Date(updatedData.createdAt),
      updatedAt: new Date(updatedData.updatedAt),
    };
  }

  async delete(id: string): Promise<boolean> {
    const mcpServerPath = this.getMcpServerPath(id);
    if (!existsSync(mcpServerPath)) {
      return false;
    }

    // Delete all files in the directory
    const entries = readdirSync(mcpServerPath);
    for (const entry of entries) {
      unlinkSync(join(mcpServerPath, entry));
    }

    // Delete the directory
    rmdirSync(mcpServerPath);
    return true;
  }

  async exists(id: string): Promise<boolean> {
    return existsSync(this.getMcpServerConfigPath(id));
  }
}

export const mcpServerRepository = new McpServerRepository();
