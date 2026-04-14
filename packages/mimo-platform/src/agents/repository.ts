import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "fs";
import { dump, load } from "js-yaml";
import crypto from "crypto";

export type AgentStatus = 
  | "online" 
  | "offline";

export type AgentProvider =
  | "opencode"
  | "claude";

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
}

export interface CreateAgentInput {
  name: string;
  owner: string;
  provider: AgentProvider;
}

interface AgentRepositoryDeps {
  agentsPath?: string;
}

export class AgentRepository {
  constructor(private deps: AgentRepositoryDeps = {}) {}

  private getAgentsPath(): string {
    if (!this.deps.agentsPath) {
      throw new Error("agentsPath is required - provide via AgentRepository constructor");
    }
    return this.deps.agentsPath;
  }

  private getAgentPath(agentId: string): string {
    return join(this.getAgentsPath(), agentId);
  }

  private getAgentFilePath(agentId: string): string {
    return join(this.getAgentPath(agentId), "agent.yaml");
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    const id = this.generateId();
    const agentPath = this.getAgentPath(id);
    
    if (!existsSync(agentPath)) {
      mkdirSync(agentPath, { recursive: true });
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

    writeFileSync(this.getAgentFilePath(id), dump(agentData), "utf-8");

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
    if (!existsSync(filePath)) {
      return null;
    }

    const content = readFileSync(filePath, "utf-8");
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
    if (!existsSync(agentsPath)) {
      return [];
    }

    const entries = readdirSync(agentsPath, { withFileTypes: true });
    const agents: Agent[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agentFile = join(agentsPath, entry.name, "agent.yaml");
        if (existsSync(agentFile)) {
          const content = readFileSync(agentFile, "utf-8");
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
    if (!existsSync(agentsPath)) {
      return [];
    }

    const entries = readdirSync(agentsPath, { withFileTypes: true });
    const agents: Agent[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agentFile = join(agentsPath, entry.name, "agent.yaml");
        if (existsSync(agentFile)) {
          const content = readFileSync(agentFile, "utf-8");
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
    updates: Partial<Omit<AgentData, "id" | "startedAt">>
  ): Promise<Agent | null> {
    const agent = await this.findById(agentId);
    if (!agent) return null;

    const updatedData: AgentData = {
      ...agent,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const filePath = this.getAgentFilePath(agentId);
    writeFileSync(filePath, dump(updatedData), "utf-8");

    return {
      ...updatedData,
      startedAt: new Date(updatedData.startedAt),
      updatedAt: new Date(updatedData.updatedAt),
      lastActivityAt: updatedData.lastActivityAt 
        ? new Date(updatedData.lastActivityAt) 
        : undefined,
    };
  }

  async updateStatus(agentId: string, status: AgentStatus): Promise<Agent | null> {
    return this.update(agentId, { status });
  }

  async updateLastActivity(agentId: string): Promise<Agent | null> {
    return this.update(agentId, { lastActivityAt: new Date().toISOString() });
  }

  async assignSession(agentId: string, sessionId: string): Promise<Agent | null> {
    const agent = await this.findById(agentId);
    if (!agent) return null;
    
    if (!agent.sessionIds.includes(sessionId)) {
      const updatedSessionIds = [...agent.sessionIds, sessionId];
      return this.update(agentId, { sessionIds: updatedSessionIds });
    }
    return agent;
  }

  async unassignSession(agentId: string, sessionId: string): Promise<Agent | null> {
    const agent = await this.findById(agentId);
    if (!agent) return null;
    
    const updatedSessionIds = agent.sessionIds.filter(id => id !== sessionId);
    return this.update(agentId, { sessionIds: updatedSessionIds });
  }

  async setSessionAssignment(agentId: string, sessionId: string, sessionRepo: any): Promise<boolean> {
    // Update agent's sessionIds
    const agent = await this.assignSession(agentId, sessionId);
    if (!agent) return false;
    
    // Update session's assignedAgentId
    await sessionRepo.update(sessionId, { assignedAgentId: agentId });
    return true;
  }

  async unsetSessionAssignment(agentId: string, sessionId: string, sessionRepo: any): Promise<boolean> {
    // Update agent's sessionIds
    const agent = await this.unassignSession(agentId, sessionId);
    if (!agent) return false;
    
    // Update session's assignedAgentId
    await sessionRepo.update(sessionId, { assignedAgentId: null });
    return true;
  }

  async delete(agentId: string): Promise<void> {
    const agentPath = this.getAgentPath(agentId);
    if (existsSync(agentPath)) {
      this.deleteDirectoryRecursive(agentPath);
    }
  }

  private deleteDirectoryRecursive(dirPath: string): void {
    if (!existsSync(dirPath)) return;

    const entries = readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        this.deleteDirectoryRecursive(entryPath);
      } else {
        unlinkSync(entryPath);
      }
    }

    rmdirSync(dirPath);
  }

  async exists(agentId: string): Promise<boolean> {
    return existsSync(this.getAgentFilePath(agentId));
  }
}

// Legacy singleton export - will be removed once all consumers use mimoContext
export const agentRepository = new AgentRepository({
  agentsPath: join(homedir(), ".mimo", "agents"),
});
