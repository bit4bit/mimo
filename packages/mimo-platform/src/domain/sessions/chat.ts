// SPDX-License-Identifier: AGPL-3.0-only
import type { MimoPaths } from "../../infrastructure/context/mimo-context.js";
import type { OS } from "../../infrastructure/os/types.js";

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
  private os: OS;

  constructor(paths: MimoPaths, os: OS) {
    this.paths = paths;
    this.os = os;
  }

  private async getChatPath(
    sessionId: string,
    chatThreadId?: string,
  ): Promise<string> {
    // Store chat in the session directory, per thread
    const sessionDir = await this.findSessionDir(sessionId);
    if (!sessionDir) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const threadsDir = this.os.path.join(sessionDir, "chat-threads");
    if (!(await this.os.fs.existsAsync(threadsDir))) {
      await this.os.fs.mkdirAsync(threadsDir, { recursive: true });
    }

    const effectiveThreadId = chatThreadId || "__session__";
    return this.os.path.join(threadsDir, `${effectiveThreadId}.jsonl`);
  }

  private async findSessionDir(sessionId: string): Promise<string | null> {
    if (!(await this.os.fs.existsAsync(this.paths.projects))) {
      return null;
    }

    const projectEntries = (await this.os.fs.readdirAsync(this.paths.projects, {
      withFileTypes: true,
    })) as Array<{ name: string; isDirectory(): boolean }>;

    for (const projectEntry of projectEntries) {
      if (projectEntry.isDirectory()) {
        const sessionsDir = this.os.path.join(
          this.paths.projects,
          projectEntry.name,
          "sessions",
        );
        if (await this.os.fs.existsAsync(sessionsDir)) {
          const sessionDir = this.os.path.join(sessionsDir, sessionId);
          if (await this.os.fs.existsAsync(sessionDir)) {
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
    chatThreadId?: string,
  ): Promise<void> {
    const chatPath = await this.getChatPath(sessionId, chatThreadId);
    const line = JSON.stringify(message) + "\n";
    await this.os.fs.appendFileAsync(chatPath, line, "utf-8");
  }

  async loadHistory(
    sessionId: string,
    chatThreadId?: string,
  ): Promise<ChatMessage[]> {
    try {
      const threadPath = await this.getChatPath(sessionId, chatThreadId);
      if (!(await this.os.fs.existsAsync(threadPath))) {
        return [];
      }

      const content = await this.os.fs.readFileAsync(threadPath, "utf-8");
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
    const chatPath = await this.getChatPath(sessionId, chatThreadId);
    const lines = messages.map((msg) => JSON.stringify(msg)).join("\n") + "\n";
    await this.os.fs.appendFileAsync(chatPath, lines, "utf-8");
  }

  async clearHistory(sessionId: string, chatThreadId?: string): Promise<void> {
    const chatPath = await this.getChatPath(sessionId, chatThreadId);
    if (await this.os.fs.existsAsync(chatPath)) {
      await this.os.fs.unlinkAsync(chatPath);
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
export function createChatService(paths: MimoPaths, os: OS): ChatService {
  return new ChatService(paths, os);
}
