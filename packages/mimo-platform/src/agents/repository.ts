import type { OS } from "../os/types.js";
import { dump, load } from "js-yaml";
import crypto from "crypto";

export type AgentStatus = "online" | "offline";

export type AgentProvider = "opencode" | "claude";

export interface AgentCapabilities {
  availableModels: Array<{ value: string; name: string; description?: string }>;
  defaultModelId: string;
  availableModes: Array<{ value: string; name: string; description?: string }>;
  defaultModeId: string;
}

export interface Agent {
  id: string;
  name: string;
  owner: string;
  token: string;
  sessionIds: string[];
  status: AgentStatus;
  provider: AgentProvider;
  startedAt: Date;
  updatedAt: Date;
  lastActivityAt?: Date;
  capabilities?: AgentCapabilities;
}

export interface AgentData {
  id: string;
  name: string;
  owner: string;
  token: string;
  sessionIds: string[];
  status: AgentStatus;
  provider: AgentProvider;
  startedAt: string;
  updatedAt: string;
  lastActivityAt?: string;
  capabilities?: AgentCapabilities;
}

export interface CreateAgentInput {
  name: string;
  owner: string;
  provider: AgentProvider;
}

interface AgentRepositoryDeps {
  os: OS;
  agentsPath?: string;
}

export class AgentRepository {
  private os: OS;

  constructor(private deps: AgentRepositoryDeps = {} as AgentRepositoryDeps) {
    this.os = deps.os;
  }

  private getAgentsPath(): string {
    if (!this.deps.agentsPath) {
      throw new Error(
        "agentsPath is required - provide via AgentRepository constructor",
      );
    }
    return this.deps.agentsPath;
  }

  private getAgentPath(agentId: string): string {
    return this.os.path.join(this.getAgentsPath(), agentId);
  }

  private getAgentFilePath(agentId: string): string {
    return this.os.path.join(this.getAgentPath(agentId), "agent.yaml");
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    const id = this.generateId();
    const agentPath = this.getAgentPath(id);

    if (!this.os.fs.exists(agentPath)) {
      this.os.fs.mkdir(agentPath, { recursive: true });
    }

    const now = new Date().toISOString();
    const agentData: AgentData = {
      id,
      name: input.name,
      owner: input.owner,
      token: crypto.randomUUID(), // Temporary placeholder, service will update with JWT
      sessionIds: [],
      status: "offline",
      provider: input.provider,
      startedAt: now,
      updatedAt: now,
    };

    this.os.fs.writeFile(this.getAgentFilePath(id), dump(agentData), {
      encoding: "utf-8",
    });

    return {
      ...agentData,
      startedAt: new Date(agentData.startedAt),
      updatedAt: new Date(agentData.updatedAt),
      lastActivityAt: agentData.lastActivityAt
        ? new Date(agentData.lastActivityAt)
        : undefined,
    };
  }

  async findById(agentId: string): Promise<Agent | null> {
    const filePath = this.getAgentFilePath(agentId);
    if (!this.os.fs.exists(filePath)) {
      return null;
    }

    const content = this.os.fs.readFile(filePath, "utf-8");
    const data = load(content) as AgentData;

    // Backward compatibility: default provider to "opencode" if not present
    const provider = data.provider || "opencode";

    return {
      ...data,
      provider,
      startedAt: new Date(data.startedAt),
      updatedAt: new Date(data.updatedAt),
      lastActivityAt: data.lastActivityAt
        ? new Date(data.lastActivityAt)
        : undefined,
    };
  }

  async findByStatus(status: AgentStatus): Promise<Agent[]> {
    const agentsPath = this.getAgentsPath();
    if (!this.os.fs.exists(agentsPath)) {
      return [];
    }

    const entries = this.os.fs.readdir(agentsPath, {
      withFileTypes: true,
    }) as import("../os/types.js").DirEnt[];
    const agents: Agent[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agentFile = this.os.path.join(
          agentsPath,
          entry.name,
          "agent.yaml",
        );
        if (this.os.fs.exists(agentFile)) {
          const content = this.os.fs.readFile(agentFile, "utf-8");
          const data = load(content) as AgentData;
          if (data.status === status) {
            // Backward compatibility: default provider to "opencode" if not present
            const provider = data.provider || "opencode";
            agents.push({
              ...data,
              provider,
              startedAt: new Date(data.startedAt),
              updatedAt: new Date(data.updatedAt),
              lastActivityAt: data.lastActivityAt
                ? new Date(data.lastActivityAt)
                : undefined,
            });
          }
        }
      }
    }

    return agents.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  async findByOwner(owner: string): Promise<Agent[]> {
    const agentsPath = this.getAgentsPath();
    if (!this.os.fs.exists(agentsPath)) {
      return [];
    }

    const entries = this.os.fs.readdir(agentsPath, {
      withFileTypes: true,
    }) as import("../os/types.js").DirEnt[];
    const agents: Agent[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agentFile = this.os.path.join(
          agentsPath,
          entry.name,
          "agent.yaml",
        );
        if (this.os.fs.exists(agentFile)) {
          const content = this.os.fs.readFile(agentFile, "utf-8");
          const data = load(content) as AgentData;
          if (data.owner === owner) {
            // Backward compatibility: default provider to "opencode" if not present
            const provider = data.provider || "opencode";
            agents.push({
              ...data,
              provider,
              startedAt: new Date(data.startedAt),
              updatedAt: new Date(data.updatedAt),
              lastActivityAt: data.lastActivityAt
                ? new Date(data.lastActivityAt)
                : undefined,
            });
          }
        }
      }
    }

    return agents.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  async update(
    agentId: string,
    updates: Partial<Omit<AgentData, "id" | "startedAt">>,
  ): Promise<Agent | null> {
    const agent = await this.findById(agentId);
    if (!agent) return null;

    const updatedData: AgentData = {
      ...agent,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const filePath = this.getAgentFilePath(agentId);
    this.os.fs.writeFile(filePath, dump(updatedData), { encoding: "utf-8" });

    return {
      ...updatedData,
      startedAt: new Date(updatedData.startedAt),
      updatedAt: new Date(updatedData.updatedAt),
      lastActivityAt: updatedData.lastActivityAt
        ? new Date(updatedData.lastActivityAt)
        : undefined,
    };
  }

  async updateStatus(
    agentId: string,
    status: AgentStatus,
  ): Promise<Agent | null> {
    return this.update(agentId, { status });
  }

  async updateLastActivity(agentId: string): Promise<Agent | null> {
    return this.update(agentId, { lastActivityAt: new Date().toISOString() });
  }

  async updateCapabilities(
    agentId: string,
    capabilities: AgentCapabilities,
  ): Promise<Agent | null> {
    return this.update(agentId, { capabilities });
  }

  async clearCapabilities(agentId: string): Promise<Agent | null> {
    return this.update(agentId, { capabilities: undefined });
  }

  async assignSession(
    agentId: string,
    sessionId: string,
  ): Promise<Agent | null> {
    const agent = await this.findById(agentId);
    if (!agent) return null;

    if (!agent.sessionIds.includes(sessionId)) {
      const updatedSessionIds = [...agent.sessionIds, sessionId];
      return this.update(agentId, { sessionIds: updatedSessionIds });
    }
    return agent;
  }

  async unassignSession(
    agentId: string,
    sessionId: string,
  ): Promise<Agent | null> {
    const agent = await this.findById(agentId);
    if (!agent) return null;

    const updatedSessionIds = agent.sessionIds.filter((id) => id !== sessionId);
    return this.update(agentId, { sessionIds: updatedSessionIds });
  }

  async setSessionAssignment(
    agentId: string,
    sessionId: string,
    sessionRepo: any,
  ): Promise<boolean> {
    // Update agent's sessionIds
    const agent = await this.assignSession(agentId, sessionId);
    if (!agent) return false;

    // Update session's assignedAgentId
    await sessionRepo.update(sessionId, { assignedAgentId: agentId });
    return true;
  }

  async unsetSessionAssignment(
    agentId: string,
    sessionId: string,
    sessionRepo: any,
  ): Promise<boolean> {
    // Update agent's sessionIds
    const agent = await this.unassignSession(agentId, sessionId);
    if (!agent) return false;

    // Update session's assignedAgentId
    await sessionRepo.update(sessionId, { assignedAgentId: null });
    return true;
  }

  async delete(agentId: string): Promise<void> {
    const agentPath = this.getAgentPath(agentId);
    if (this.os.fs.exists(agentPath)) {
      this.deleteDirectoryRecursive(agentPath);
    }
  }

  private deleteDirectoryRecursive(dirPath: string): void {
    if (!this.os.fs.exists(dirPath)) return;

    const entries = this.os.fs.readdir(dirPath, {
      withFileTypes: true,
    }) as import("../os/types.js").DirEnt[];

    for (const entry of entries) {
      const entryPath = this.os.path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        this.deleteDirectoryRecursive(entryPath);
      } else {
        this.os.fs.unlink(entryPath);
      }
    }

    this.os.fs.rm(dirPath);
  }

  async exists(agentId: string): Promise<boolean> {
    return this.os.fs.exists(this.getAgentFilePath(agentId));
  }
}
