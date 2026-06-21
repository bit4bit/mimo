// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import { dump, load } from "js-yaml";
import crypto from "crypto";
import type { SharedGrant } from "./sharing.js";

export type { SharedGrant } from "./sharing.js";

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
  sharedWith: SharedGrant[];
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
  sharedWith?: SharedGrant[];
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

  /**
   * Converts persisted AgentData into a runtime Agent, applying defaults:
   * provider falls back to "opencode" for legacy records, sharedWith defaults
   * to an empty list, and date strings become Date objects.
   */
  private hydrate(data: AgentData): Agent {
    return {
      ...data,
      provider: data.provider || "opencode",
      sharedWith: data.sharedWith ?? [],
      startedAt: new Date(data.startedAt),
      updatedAt: new Date(data.updatedAt),
      lastActivityAt: data.lastActivityAt
        ? new Date(data.lastActivityAt)
        : undefined,
    };
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
      sharedWith: [],
    };

    this.os.fs.writeFile(this.getAgentFilePath(id), dump(agentData), {
      encoding: "utf-8",
    });

    return this.hydrate(agentData);
  }

  async findById(agentId: string): Promise<Agent | null> {
    const filePath = this.getAgentFilePath(agentId);
    if (!this.os.fs.exists(filePath)) {
      return null;
    }

    const content = this.os.fs.readFile(filePath, "utf-8");
    const data = load(content) as AgentData;

    return this.hydrate(data);
  }

  /**
   * Scans every persisted agent, returning the hydrated agents whose data
   * matches the predicate, newest first.
   */
  private scanAgents(match: (data: AgentData) => boolean): Agent[] {
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
          if (match(data)) {
            agents.push(this.hydrate(data));
          }
        }
      }
    }

    return agents.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  async findByStatus(status: AgentStatus): Promise<Agent[]> {
    return this.scanAgents((data) => data.status === status);
  }

  async findByOwner(owner: string): Promise<Agent[]> {
    return this.scanAgents((data) => data.owner === owner);
  }

  /**
   * Finds agents shared with the given user (i.e. the user appears in the
   * agent's sharedWith list). Does not include agents the user owns.
   */
  async findSharedWith(username: string): Promise<Agent[]> {
    return this.scanAgents((data) =>
      (data.sharedWith ?? []).some((grant) => grant.username === username),
    );
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

    return this.hydrate(updatedData);
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

  /**
   * Grants `username` permission to use the agent. Idempotent: if the user is
   * already in sharedWith, the agent is returned unchanged.
   */
  async addShare(agentId: string, username: string): Promise<Agent | null> {
    const agent = await this.findById(agentId);
    if (!agent) return null;

    if (agent.sharedWith.some((grant) => grant.username === username)) {
      return agent;
    }

    const sharedWith: SharedGrant[] = [
      ...agent.sharedWith,
      { username, permission: "use" },
    ];
    return this.update(agentId, { sharedWith });
  }

  /** Revokes `username`'s access to the agent. */
  async removeShare(agentId: string, username: string): Promise<Agent | null> {
    const agent = await this.findById(agentId);
    if (!agent) return null;

    const sharedWith = agent.sharedWith.filter(
      (grant) => grant.username !== username,
    );
    return this.update(agentId, { sharedWith });
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
