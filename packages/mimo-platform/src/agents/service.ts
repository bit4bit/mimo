import { Agent, AgentRepository, AgentStatus, agentRepository } from "./repository.js";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const AGENT_SECRET = new TextEncoder().encode(JWT_SECRET);

export interface AgentTokenPayload {
  agentId: string;
  sessionId?: string;
  projectId?: string;
  owner: string;
}

export interface CreateAgentInput {
  owner: string;
  sessionId?: string;
  projectId?: string;
}

export class AgentService {
  private activeConnections: Map<string, WebSocket> = new Map();
  private currentAcpRequest: Map<string, AbortController> = new Map();
  private agentWorkdirs: Map<string, string> = new Map();

  constructor(
    private repository: AgentRepository = agentRepository
  ) {}

  async createAgent(input: CreateAgentInput): Promise<Agent> {
    const agent = await this.repository.create({
      owner: input.owner,
    });

    const token = await this.generateAgentToken(agent, input.sessionId, input.projectId);
    await this.repository.update(agent.id, { token });
    
    return { ...agent, token };
  }

  async generateAgentToken(agent: Agent, sessionId?: string, projectId?: string): Promise<string> {
    const tokenPayload: any = {
      agentId: agent.id,
      owner: agent.owner,
    };
    
    if (sessionId) {
      tokenPayload.sessionId = sessionId;
    }
    if (projectId) {
      tokenPayload.projectId = projectId;
    }
    
    const token = await new SignJWT(tokenPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(AGENT_SECRET);

    return token;
  }

  async verifyAgentToken(token: string): Promise<AgentTokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, AGENT_SECRET);
      return {
        agentId: payload.agentId as string,
        sessionId: payload.sessionId as string | undefined,
        projectId: payload.projectId as string | undefined,
        owner: payload.owner as string,
      };
    } catch {
      return null;
    }
  }

  async handleAgentConnect(agentId: string, ws: WebSocket, workdir?: string): Promise<void> {
    const agent = await this.repository.findById(agentId);
    if (!agent) {
      ws.close(1008, "Agent not found");
      return;
    }

    this.activeConnections.set(agentId, ws);
    if (workdir) {
      this.agentWorkdirs.set(agentId, workdir);
    }
    await this.repository.updateStatus(agentId, "online");
    await this.repository.updateLastActivity(agentId);
  }

  getAgentWorkdir(agentId: string): string | undefined {
    return this.agentWorkdirs.get(agentId);
  }

  async handleAgentDisconnect(agentId: string): Promise<void> {
    this.activeConnections.delete(agentId);
    await this.repository.updateStatus(agentId, "offline");
  }

  async cancelCurrentRequest(sessionId: string): Promise<boolean> {
    const sessionRepo = await import("../sessions/repository.js");
    const session = await sessionRepo.sessionRepository.findById(sessionId);
    if (!session || !session.assignedAgentId) {
      return false;
    }

    const agent = await this.repository.findById(session.assignedAgentId);
    if (!agent || agent.status !== "online") {
      return false;
    }

    const controller = this.currentAcpRequest.get(session.assignedAgentId);
    if (controller) {
      controller.abort();
      this.currentAcpRequest.delete(session.assignedAgentId);
    }

    const ws = this.activeConnections.get(session.assignedAgentId);
    if (ws) {
      ws.send(JSON.stringify({ type: "cancel_request" }));
    }

    return true;
  }

  async deleteAgent(agentId: string): Promise<boolean> {
    const agent = await this.repository.findById(agentId);
    if (!agent) return false;

    if (this.activeConnections.has(agentId)) {
      const ws = this.activeConnections.get(agentId);
      ws?.close(1000, "Agent deleted");
      this.activeConnections.delete(agentId);
    }

    this.currentAcpRequest.delete(agentId);
    await this.repository.delete(agentId);
    
    return true;
  }

  async getAgentStatus(agentId: string): Promise<Agent | null> {
    return this.repository.findById(agentId);
  }

  async listAgentsByOwner(owner: string): Promise<Agent[]> {
    return this.repository.findByOwner(owner);
  }

  async listAgentsByStatus(status: AgentStatus): Promise<Agent[]> {
    return this.repository.findByStatus(status);
  }

  isAgentOnline(agentId: string): boolean {
    return this.activeConnections.has(agentId);
  }

  getAgentConnection(agentId: string): WebSocket | undefined {
    return this.activeConnections.get(agentId);
  }

  startAcpRequest(agentId: string): AbortController {
    const controller = new AbortController();
    this.currentAcpRequest.set(agentId, controller);
    return controller;
  }

  endAcpRequest(agentId: string): void {
    this.currentAcpRequest.delete(agentId);
  }

  async sendToAgent(agentId: string, message: unknown): Promise<boolean> {
    const ws = this.activeConnections.get(agentId);
    if (!ws) return false;

    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }
}

export const agentService = new AgentService();