import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "fs";
import { getPaths } from "../config/paths.js";
import { dump, load } from "js-yaml";
import crypto from "crypto";

export type AgentStatus = 
  | "starting" 
  | "connected" 
  | "failed" 
  | "killed" 
  | "died";

export interface Agent {
  id: string;
  sessionId: string;
  projectId: string;
  owner: string;
  token: string;
  status: AgentStatus;
  pid?: number;
  startedAt: Date;
  updatedAt: Date;
  lastActivityAt?: Date;
}

export interface AgentData {
  id: string;
  sessionId: string;
  projectId: string;
  owner: string;
  token: string;
  status: AgentStatus;
  pid?: number;
  startedAt: string;
  updatedAt: string;
  lastActivityAt?: string;
}

export interface CreateAgentInput {
  sessionId: string;
  projectId: string;
  owner: string;
  token: string;
}

export class AgentRepository {
  private getAgentPath(agentId: string): string {
    return join(getPaths().agents, agentId);
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
      sessionId: input.sessionId,
      projectId: input.projectId,
      owner: input.owner,
      token: input.token,
      status: "starting",
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

    return {
      ...data,
      startedAt: new Date(data.startedAt),
      updatedAt: new Date(data.updatedAt),
      lastActivityAt: data.lastActivityAt 
        ? new Date(data.lastActivityAt) 
        : undefined,
    };
  }

  async findBySessionId(sessionId: string): Promise<Agent[]> {
    const Paths = getPaths();
    if (!existsSync(Paths.agents)) {
      return [];
    }

    const entries = readdirSync(Paths.agents, { withFileTypes: true });
    const agents: Agent[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agentFile = join(Paths.agents, entry.name, "agent.yaml");
        if (existsSync(agentFile)) {
          const content = readFileSync(agentFile, "utf-8");
          const data = load(content) as AgentData;
          if (data.sessionId === sessionId) {
            agents.push({
              ...data,
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
    const Paths = getPaths();
    if (!existsSync(Paths.agents)) {
      return [];
    }

    const entries = readdirSync(Paths.agents, { withFileTypes: true });
    const agents: Agent[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agentFile = join(Paths.agents, entry.name, "agent.yaml");
        if (existsSync(agentFile)) {
          const content = readFileSync(agentFile, "utf-8");
          const data = load(content) as AgentData;
          if (data.owner === owner) {
            agents.push({
              ...data,
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

  async updatePid(agentId: string, pid: number): Promise<Agent | null> {
    return this.update(agentId, { pid });
  }

  async updateLastActivity(agentId: string): Promise<Agent | null> {
    return this.update(agentId, { lastActivityAt: new Date().toISOString() });
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

export const agentRepository = new AgentRepository();
