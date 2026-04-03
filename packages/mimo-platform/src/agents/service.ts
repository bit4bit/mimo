import { spawn, Subprocess } from "bun";
import { join } from "path";
import { Agent, AgentRepository, AgentStatus, agentRepository } from "./repository.js";
import { ChatService, chatService } from "../sessions/chat.js";
import { SignJWT, jwtVerify } from "jose";
import { getPaths } from "../config/paths.js";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const AGENT_SECRET = new TextEncoder().encode(JWT_SECRET);
const PLATFORM_URL = process.env.PLATFORM_URL || "ws://localhost:3000";

export interface AgentTokenPayload {
  agentId: string;
  sessionId: string;
  projectId: string;
  owner: string;
}

export interface SpawnAgentInput {
  sessionId: string;
  projectId: string;
  owner: string;
  agentPath?: string; // Path to mimo-agent binary
}

export class AgentService {
  private runningProcesses: Map<string, Subprocess> = new Map();
  private activeConnections: Map<string, WebSocket> = new Map();
  private currentAcpRequest: Map<string, AbortController> = new Map();

  constructor(
    private repository: AgentRepository = agentRepository,
    private chat: ChatService = chatService
  ) {}

  async generateAgentToken(agent: Agent): Promise<string> {
    const token = await new SignJWT({
      agentId: agent.id,
      sessionId: agent.sessionId,
      projectId: agent.projectId,
      owner: agent.owner,
    })
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
        sessionId: payload.sessionId as string,
        projectId: payload.projectId as string,
        owner: payload.owner as string,
      };
    } catch {
      return null;
    }
  }

  async spawnAgent(input: SpawnAgentInput): Promise<Agent> {
    // Generate token first
    const tempToken = await new SignJWT({
      sessionId: input.sessionId,
      projectId: input.projectId,
      owner: input.owner,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(AGENT_SECRET);

    // Create agent record
    const agent = await this.repository.create({
      sessionId: input.sessionId,
      projectId: input.projectId,
      owner: input.owner,
      token: tempToken,
    });

    // Generate proper token with agent ID
    const token = await this.generateAgentToken(agent);
    await this.repository.update(agent.id, { token });
    agent.token = token;

    // Add system message
    await this.chat.saveMessage(input.sessionId, {
      role: "system",
      content: "Agent starting...",
      timestamp: new Date().toISOString(),
      metadata: { agentId: agent.id },
    });

    // Try to spawn the agent process
    try {
      await this.startAgentProcess(agent, input.agentPath);
    } catch (error) {
      await this.handleAgentFailure(agent.id, error as Error);
      throw error;
    }

    return agent;
  }

  private async startAgentProcess(agent: Agent, agentPath?: string): Promise<void> {
    const binary = agentPath || process.env.MIMO_AGENT_PATH || "mimo-agent";
    const platformWsUrl = `${PLATFORM_URL}/ws/agent`;

    try {
      const proc = spawn({
        cmd: [binary, "--token", agent.token, "--platform", platformWsUrl],
        stdout: "pipe",
        stderr: "pipe",
        onExit: async (code, signal) => {
          await this.handleProcessExit(agent.id, code, signal);
        },
      });

      this.runningProcesses.set(agent.id, proc);

      // Update agent with PID
      if (proc.pid) {
        await this.repository.updatePid(agent.id, proc.pid);
      }

      // Monitor stderr for errors
      if (proc.stderr) {
        const reader = proc.stderr.getReader();
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const errorText = new TextDecoder().decode(value);
              console.error(`Agent ${agent.id} stderr:`, errorText);
            }
          } catch (error) {
            console.error(`Error reading agent ${agent.id} stderr:`, error);
          }
        })();
      }
    } catch (error) {
      throw new Error(`Failed to spawn agent process: ${(error as Error).message}`);
    }
  }

  private async handleProcessExit(
    agentId: string, 
    code: number | null, 
    signal: number | null
  ): Promise<void> {
    const agent = await this.repository.findById(agentId);
    if (!agent) return;

    // Remove from running processes
    this.runningProcesses.delete(agentId);
    this.activeConnections.delete(agentId);
    this.currentAcpRequest.delete(agentId);

    if (code === 0 || signal === 0) {
      // Normal exit - already handled by kill command
      return;
    }

    // Unexpected exit
    const status: AgentStatus = agent.status === "killed" ? "killed" : "died";
    await this.repository.updateStatus(agentId, status);

    // Clean up orphaned ACP processes if any
    if (agent.pid) {
      try {
        process.kill(agent.pid, 0); // Check if process exists
        process.kill(agent.pid, "SIGTERM");
      } catch {
        // Process already gone
      }
    }

    // Notify via chat
    await this.chat.saveMessage(agent.sessionId, {
      role: "system",
      content: status === "killed" 
        ? "Agent terminated" 
        : `Agent process died unexpectedly (code: ${code}, signal: ${signal})`,
      timestamp: new Date().toISOString(),
      metadata: { agentId, code, signal },
    });
  }

  private async handleAgentFailure(agentId: string, error: Error): Promise<void> {
    await this.repository.updateStatus(agentId, "failed");

    const agent = await this.repository.findById(agentId);
    if (agent) {
      await this.chat.saveMessage(agent.sessionId, {
        role: "system",
        content: `Agent failed to start: ${error.message}`,
        timestamp: new Date().toISOString(),
        metadata: { agentId, error: error.message },
      });
    }
  }

  async handleAgentConnect(agentId: string, ws: WebSocket): Promise<void> {
    const agent = await this.repository.findById(agentId);
    if (!agent) {
      ws.close(1008, "Agent not found");
      return;
    }

    this.activeConnections.set(agentId, ws);
    await this.repository.updateStatus(agentId, "connected");
    await this.repository.updateLastActivity(agentId);

    await this.chat.saveMessage(agent.sessionId, {
      role: "system",
      content: "Agent connected",
      timestamp: new Date().toISOString(),
      metadata: { agentId },
    });
  }

  async handleAgentDisconnect(agentId: string): Promise<void> {
    this.activeConnections.delete(agentId);
    
    const agent = await this.repository.findById(agentId);
    if (agent && agent.status === "connected") {
      await this.repository.updateStatus(agentId, "died");
      
      await this.chat.saveMessage(agent.sessionId, {
        role: "system",
        content: "Agent disconnected unexpectedly",
        timestamp: new Date().toISOString(),
        metadata: { agentId },
      });
    }
  }

  async cancelCurrentRequest(sessionId: string): Promise<boolean> {
    const agents = await this.repository.findBySessionId(sessionId);
    const connectedAgent = agents.find(a => a.status === "connected");
    
    if (!connectedAgent) {
      await this.chat.saveMessage(sessionId, {
        role: "system",
        content: "No active request to cancel",
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    const controller = this.currentAcpRequest.get(connectedAgent.id);
    if (controller) {
      controller.abort();
      this.currentAcpRequest.delete(connectedAgent.id);
    }

    // Send cancel message via WebSocket
    const ws = this.activeConnections.get(connectedAgent.id);
    if (ws) {
      ws.send(JSON.stringify({ type: "cancel_request" }));
    }

    await this.chat.saveMessage(sessionId, {
      role: "system",
      content: "Request cancelled",
      timestamp: new Date().toISOString(),
      metadata: { agentId: connectedAgent.id },
    });

    return true;
  }

  async killAgent(agentId: string): Promise<boolean> {
    const agent = await this.repository.findById(agentId);
    if (!agent) return false;

    // Send kill command via WebSocket first
    const ws = this.activeConnections.get(agentId);
    if (ws) {
      ws.send(JSON.stringify({ type: "terminate" }));
      ws.close(1000, "Agent terminated by user");
    }

    // Kill the process
    const proc = this.runningProcesses.get(agentId);
    if (proc) {
      proc.kill();
      this.runningProcesses.delete(agentId);
    }

    // If process kill didn't work, try direct signal
    if (agent.pid) {
      try {
        process.kill(agent.pid, "SIGTERM");
        setTimeout(() => {
          try {
            process.kill(agent.pid!, "SIGKILL");
          } catch {
            // Already dead
          }
        }, 5000);
      } catch {
        // Already dead
      }
    }

    await this.repository.updateStatus(agentId, "killed");
    this.activeConnections.delete(agentId);
    this.currentAcpRequest.delete(agentId);

    await this.chat.saveMessage(agent.sessionId, {
      role: "system",
      content: "Agent terminated",
      timestamp: new Date().toISOString(),
      metadata: { agentId },
    });

    return true;
  }

  async killAgentsBySession(sessionId: string): Promise<number> {
    const agents = await this.repository.findBySessionId(sessionId);
    let killed = 0;

    for (const agent of agents) {
      if (agent.status === "connected" || agent.status === "starting") {
        await this.killAgent(agent.id);
        killed++;
      }
    }

    return killed;
  }

  async getAgentStatus(agentId: string): Promise<Agent | null> {
    return this.repository.findById(agentId);
  }

  async listAgentsByOwner(owner: string): Promise<Agent[]> {
    return this.repository.findByOwner(owner);
  }

  async listAgentsBySession(sessionId: string): Promise<Agent[]> {
    return this.repository.findBySessionId(sessionId);
  }

  async cleanupDeadAgents(): Promise<void> {
    const Paths = getPaths();
    const agentsDir = Paths.agents;
    
    const { readdirSync, existsSync } = require("fs");
    if (!existsSync(agentsDir)) return;

    const entries = readdirSync(agentsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agent = await this.repository.findById(entry.name);
        if (agent && agent.pid) {
          try {
            // Check if process still exists
            process.kill(agent.pid, 0);
          } catch {
            // Process is gone
            if (agent.status === "connected" || agent.status === "starting") {
              await this.repository.updateStatus(agent.id, "died");
            }
          }
        }
      }
    }
  }

  // Called when a new ACP request starts
  startAcpRequest(agentId: string): AbortController {
    const controller = new AbortController();
    this.currentAcpRequest.set(agentId, controller);
    return controller;
  }

  // Called when ACP request completes
  endAcpRequest(agentId: string): void {
    this.currentAcpRequest.delete(agentId);
  }

  // Send message to agent
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
