import {
  Agent,
  AgentRepository,
  AgentStatus,
  AgentProvider,
} from "./repository.js";
import { SignJWT, jwtVerify } from "jose";
import { logger } from "../logger.js";

const DEFAULT_JWT_SECRET = "your-secret-key-change-in-production";

export interface AgentTokenPayload {
  agentId: string;
  sessionId?: string;
  projectId?: string;
  owner: string;
  provider: AgentProvider;
}

export interface CreateAgentInput {
  name: string;
  owner: string;
  provider: AgentProvider;
  sessionId?: string;
  projectId?: string;
}

export class AgentService {
  private activeConnections: Map<string, WebSocket> = new Map();
  private currentAcpRequest: Map<string, AbortController> = new Map();
  private agentWorkdirs: Map<string, string> = new Map();
  private agentSecret: Uint8Array;

  constructor(
    private repository: AgentRepository,
    jwtSecret: string = DEFAULT_JWT_SECRET,
  ) {
    this.agentSecret = new TextEncoder().encode(jwtSecret);
  }

  async createAgent(input: CreateAgentInput): Promise<Agent> {
    // Validate name
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Name is required");
    }
    if (input.name.length > 64) {
      throw new Error("Name must be 64 characters or less");
    }

    // Validate provider
    if (!input.provider) {
      throw new Error("Provider is required");
    }
    if (input.provider !== "opencode" && input.provider !== "claude") {
      throw new Error("Provider must be 'opencode' or 'claude'");
    }

    const agent = await this.repository.create({
      name: input.name.trim(),
      owner: input.owner,
      provider: input.provider,
    });

    const token = await this.generateAgentToken(
      agent,
      input.sessionId,
      input.projectId,
    );
    await this.repository.update(agent.id, { token });

    return { ...agent, token };
  }

  async generateAgentToken(
    agent: Agent,
    sessionId?: string,
    projectId?: string,
  ): Promise<string> {
    const tokenPayload: any = {
      agentId: agent.id,
      owner: agent.owner,
      provider: agent.provider,
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
      .setExpirationTime("1y")
      .sign(this.agentSecret);

    return token;
  }

  async verifyAgentToken(token: string): Promise<AgentTokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.agentSecret);
      return {
        agentId: payload.agentId as string,
        sessionId: payload.sessionId as string | undefined,
        projectId: payload.projectId as string | undefined,
        owner: payload.owner as string,
        provider: payload.provider as AgentProvider,
      };
    } catch (error) {
      logger.error(
        "[verifyAgentToken] Token verification failed:",
        error?.message || error,
      );
      return null;
    }
  }

  async handleAgentConnect(
    agentId: string,
    ws: WebSocket,
    workdir?: string,
  ): Promise<void> {
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

  async cancelCurrentRequest(
    sessionId: string,
    chatThreadId?: string,
  ): Promise<boolean> {
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

    const threadId = chatThreadId || session.activeChatThreadId;
    if (!threadId) {
      return false;
    }

    const ws = this.activeConnections.get(session.assignedAgentId);
    if (ws) {
      ws.send(
        JSON.stringify({
          type: "cancel_request",
          sessionId,
          chatThreadId: threadId,
        }),
      );
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

  async notifySessionEnded(sessionId: string, agentId: string): Promise<void> {
    const ws = this.activeConnections.get(agentId);
    if (ws && ws.readyState === 1) {
      // 1 = OPEN
      try {
        ws.send(
          JSON.stringify({
            type: "session_ended",
            sessionId,
          }),
        );
      } catch (error) {
        logger.error(
          `[notifySessionEnded] Failed to notify agent ${agentId}:`,
          error,
        );
      }
    }
    // Cleanup any in-flight ACP requests for this agent
    this.currentAcpRequest.delete(agentId);
  }
}

export const agentService = new AgentService();
