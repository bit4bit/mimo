import { join } from "path";
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "fs";
import type { MimoPaths } from "../context/mimo-context.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  chatThreadId?: string;
  metadata?: Record<string, unknown>;
}

export class ChatService {
  // Track last activity per session for agent health monitoring
  private lastAgentActivity: Map<string, number> = new Map();
  private readonly AGENT_TIMEOUT_MS = 300000; // 5 minutes
  private paths: MimoPaths;

  constructor(paths: MimoPaths) {
    this.paths = paths;
  }

  private getChatPath(sessionId: string, chatThreadId?: string): string {
    // Store chat in the session directory, optionally per thread
    const sessionDir = this.findSessionDir(sessionId);
    if (!sessionDir) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // If thread-specific, store in threads subdirectory
    if (chatThreadId) {
      const threadsDir = join(sessionDir, "chat-threads");
      if (!existsSync(threadsDir)) {
        mkdirSync(threadsDir, { recursive: true });
      }
      return join(threadsDir, `${chatThreadId}.jsonl`);
    }
    
    // Legacy global chat path (for backward compatibility)
    return join(sessionDir, "chat.jsonl");
  }

  private findSessionDir(sessionId: string): string | null {
    if (!existsSync(this.paths.projects)) {
      return null;
    }

    const { readdirSync } = require("fs");
    const projectEntries = readdirSync(this.paths.projects, {
      withFileTypes: true,
    });

    for (const projectEntry of projectEntries) {
      if (projectEntry.isDirectory()) {
        const sessionsDir = join(
          this.paths.projects,
          projectEntry.name,
          "sessions",
        );
        if (existsSync(sessionsDir)) {
          const sessionDir = join(sessionsDir, sessionId);
          if (existsSync(sessionDir)) {
            return sessionDir;
          }
        }
      }
    }

    return null;
  }

  async saveMessage(
    sessionId: string, 
    message: ChatMessage, 
    chatThreadId?: string
  ): Promise<void> {
    const chatPath = this.getChatPath(sessionId, chatThreadId);
    const line = JSON.stringify(message) + "\n";
    appendFileSync(chatPath, line, "utf-8");
  }

  async loadHistory(
    sessionId: string, 
    chatThreadId?: string
  ): Promise<ChatMessage[]> {
    try {
      // Try thread-specific path first
      if (chatThreadId) {
        const threadPath = this.getChatPath(sessionId, chatThreadId);
        if (existsSync(threadPath)) {
          const content = readFileSync(threadPath, "utf-8");
          const lines = content
            .trim()
            .split("\n")
            .filter((line) => line);

          return lines.map((line) => JSON.parse(line) as ChatMessage);
        }
      }
      
      // Fall back to legacy global chat path
      const chatPath = this.getChatPath(sessionId);
      if (!existsSync(chatPath)) {
        return [];
      }

      const content = readFileSync(chatPath, "utf-8");
      const lines = content
        .trim()
        .split("\n")
        .filter((line) => line);

      return lines.map((line) => JSON.parse(line) as ChatMessage);
    } catch {
      return [];
    }
  }

  async appendToHistory(
    sessionId: string,
    messages: ChatMessage[],
    chatThreadId?: string,
  ): Promise<void> {
    const chatPath = this.getChatPath(sessionId, chatThreadId);
    const lines = messages.map((msg) => JSON.stringify(msg)).join("\n") + "\n";
    appendFileSync(chatPath, lines, "utf-8");
  }

  async clearHistory(sessionId: string, chatThreadId?: string): Promise<void> {
    const chatPath = this.getChatPath(sessionId, chatThreadId);
    if (existsSync(chatPath)) {
      const { unlinkSync } = require("fs");
      unlinkSync(chatPath);
    }
  }

  // Track agent activity for health monitoring
  updateAgentActivity(sessionId: string): void {
    this.lastAgentActivity.set(sessionId, Date.now());
  }

  // Check if agent is still alive (has activity within timeout window)
  isAgentAlive(sessionId: string): boolean {
    const lastActivity = this.lastAgentActivity.get(sessionId);
    if (!lastActivity) {
      return false; // No activity recorded
    }
    return Date.now() - lastActivity < this.AGENT_TIMEOUT_MS;
  }

  // Get last agent activity timestamp
  getLastAgentActivity(sessionId: string): number | undefined {
    return this.lastAgentActivity.get(sessionId);
  }

  // Clear agent activity tracking (e.g., when session ends)
  clearAgentActivity(sessionId: string): void {
    this.lastAgentActivity.delete(sessionId);
  }
}

// Factory function for creating ChatService with injected paths
export function createChatService(paths: MimoPaths): ChatService {
  return new ChatService(paths);
}
