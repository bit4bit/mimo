import type { OS } from "../os/types.js";
import { dump, load } from "js-yaml";
import type {
  McpServer,
  McpServerData,
  CreateMcpServerInput,
  UpdateMcpServerInput,
} from "./types.js";
import { slugify } from "./types.js";

interface McpServerRepositoryDeps {
  os: OS;
  mcpServersPath?: string;
}

export class McpServerRepository {
  private os: OS;

  constructor(private deps: McpServerRepositoryDeps = {} as McpServerRepositoryDeps) {
    this.os = deps.os;
  }

  private getMcpServersPath(): string {
    if (!this.deps.mcpServersPath) {
      throw new Error(
        "mcpServersPath is required - provide via McpServerRepository constructor",
      );
    }
    return this.deps.mcpServersPath;
  }

  private getMcpServerPath(id: string): string {
    return this.os.path.join(this.getMcpServersPath(), id);
  }

  private getMcpServerConfigPath(id: string): string {
    return this.os.path.join(this.getMcpServerPath(id), "config.yaml");
  }

  private ensureMcpServersDir(): void {
    const path = this.getMcpServersPath();
    if (!this.os.fs.exists(path)) {
      this.os.fs.mkdir(path, { recursive: true });
    }
  }

  async create(input: CreateMcpServerInput): Promise<McpServer> {
    this.ensureMcpServersDir();

    const id = slugify(input.name);
    const mcpServerPath = this.getMcpServerPath(id);

    // Check if already exists
    if (this.os.fs.exists(mcpServerPath)) {
      throw new Error(`MCP server with name '${input.name}' already exists`);
    }

    // Create directory
    this.os.fs.mkdir(mcpServerPath, { recursive: true });

    const now = new Date().toISOString();
    const mcpServerData: McpServerData = {
      id,
      name: input.name,
      description: input.description,
      transport: input.transport,
      ...(input.transport === "stdio" && {
        command: input.command,
        args: input.args || [],
      }),
      ...(input.transport !== "stdio" && {
        url: input.url,
        headers: input.headers,
      }),
      createdAt: now,
      updatedAt: now,
    };

    this.os.fs.writeFile(
      this.getMcpServerConfigPath(id),
      dump(mcpServerData),
      { encoding: "utf-8" },
    );

    return {
      ...mcpServerData,
      createdAt: new Date(mcpServerData.createdAt),
      updatedAt: new Date(mcpServerData.updatedAt),
    };
  }

  async findById(id: string): Promise<McpServer | null> {
    const configPath = this.getMcpServerConfigPath(id);
    if (!this.os.fs.exists(configPath)) {
      return null;
    }

    const content = this.os.fs.readFile(configPath, "utf-8");
    const data = load(content) as McpServerData;

    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
  }

  async findAll(): Promise<McpServer[]> {
    const mcpServersPath = this.getMcpServersPath();
    if (!this.os.fs.exists(mcpServersPath)) {
      return [];
    }

    const entries = this.os.fs.readdir(mcpServersPath, { withFileTypes: true }) as import("../os/types.js").DirEnt[];
    const servers: McpServer[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const configPath = this.getMcpServerConfigPath(entry.name);
        if (this.os.fs.exists(configPath)) {
          const content = this.os.fs.readFile(configPath, "utf-8");
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

  async update(
    id: string,
    input: UpdateMcpServerInput,
  ): Promise<McpServer | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updatedData: McpServerData = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && {
        description: input.description,
      }),
      ...(input.transport !== undefined && { transport: input.transport }),
      ...(input.command !== undefined && { command: input.command }),
      ...(input.args !== undefined && { args: input.args }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.headers !== undefined && { headers: input.headers }),
      id, // ID is immutable
      updatedAt: new Date().toISOString(),
    };

    this.os.fs.writeFile(this.getMcpServerConfigPath(id), dump(updatedData), { encoding: "utf-8" });

    return {
      ...updatedData,
      createdAt: new Date(updatedData.createdAt),
      updatedAt: new Date(updatedData.updatedAt),
    };
  }

  async delete(id: string): Promise<boolean> {
    const mcpServerPath = this.getMcpServerPath(id);
    if (!this.os.fs.exists(mcpServerPath)) {
      return false;
    }

    // Delete all files in the directory
    const entries = this.os.fs.readdir(mcpServerPath) as string[];
    for (const entry of entries) {
      this.os.fs.unlink(this.os.path.join(mcpServerPath, entry));
    }

    // Delete the directory
    this.os.fs.rm(mcpServerPath);
    return true;
  }

  async exists(id: string): Promise<boolean> {
    return this.os.fs.exists(this.getMcpServerConfigPath(id));
  }
}
