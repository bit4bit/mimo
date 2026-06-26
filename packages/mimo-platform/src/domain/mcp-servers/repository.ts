// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
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

  constructor(
    private deps: McpServerRepositoryDeps = {} as McpServerRepositoryDeps,
  ) {
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

  private async ensureMcpServersDir(): Promise<void> {
    const path = this.getMcpServersPath();
    if (!(await this.os.fs.existsAsync(path))) {
      await this.os.fs.mkdirAsync(path, { recursive: true });
    }
  }

  async create(input: CreateMcpServerInput): Promise<McpServer> {
    await this.ensureMcpServersDir();

    const id = slugify(input.name);
    const mcpServerPath = this.getMcpServerPath(id);

    // Check if already exists
    if (await this.os.fs.existsAsync(mcpServerPath)) {
      throw new Error(`MCP server with name '${input.name}' already exists`);
    }

    // Create directory
    await this.os.fs.mkdirAsync(mcpServerPath, { recursive: true });

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

    await this.os.fs.writeFileAsync(
      this.getMcpServerConfigPath(id),
      dump(mcpServerData),
      {
        encoding: "utf-8",
      },
    );

    return {
      ...mcpServerData,
      createdAt: new Date(mcpServerData.createdAt),
      updatedAt: new Date(mcpServerData.updatedAt),
    };
  }

  async findById(id: string): Promise<McpServer | null> {
    const configPath = this.getMcpServerConfigPath(id);
    if (!(await this.os.fs.existsAsync(configPath))) {
      return null;
    }

    const content = await this.os.fs.readFileAsync(configPath, "utf-8");
    const data = load(content) as McpServerData;

    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
  }

  async findAll(): Promise<McpServer[]> {
    const mcpServersPath = this.getMcpServersPath();
    if (!(await this.os.fs.existsAsync(mcpServersPath))) {
      return [];
    }

    const entries = (await this.os.fs.readdirAsync(mcpServersPath, {
      withFileTypes: true,
    })) as import("../../infrastructure/os/types.js").DirEnt[];
    const servers: McpServer[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) {
          const configPath = this.getMcpServerConfigPath(entry.name);
          if (await this.os.fs.existsAsync(configPath)) {
            const content = await this.os.fs.readFileAsync(configPath, "utf-8");
            const data = load(content) as McpServerData;
            servers.push({
              ...data,
              createdAt: new Date(data.createdAt),
              updatedAt: new Date(data.updatedAt),
            });
          }
        }
      }),
    );

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

    await this.os.fs.writeFileAsync(
      this.getMcpServerConfigPath(id),
      dump(updatedData),
      {
        encoding: "utf-8",
      },
    );

    return {
      ...updatedData,
      createdAt: new Date(updatedData.createdAt),
      updatedAt: new Date(updatedData.updatedAt),
    };
  }

  async delete(id: string): Promise<boolean> {
    const mcpServerPath = this.getMcpServerPath(id);
    if (!(await this.os.fs.existsAsync(mcpServerPath))) {
      return false;
    }

    // Delete all files in the directory
    const entries = (await this.os.fs.readdirAsync(mcpServerPath)) as string[];
    for (const entry of entries) {
      await this.os.fs.unlinkAsync(this.os.path.join(mcpServerPath, entry));
    }

    // Delete the directory
    await this.os.fs.rmAsync(mcpServerPath, { recursive: true, force: true });
    return true;
  }

  async exists(id: string): Promise<boolean> {
    return this.os.fs.existsAsync(this.getMcpServerConfigPath(id));
  }
}
