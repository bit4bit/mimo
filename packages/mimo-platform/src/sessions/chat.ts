import { join } from "path";
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "fs";
import { getPaths } from "../config/paths.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class ChatService {
  private getChatPath(sessionId: string): string {
    // Store chat in the session directory
    const Paths = getPaths();
    const sessionDir = this.findSessionDir(sessionId);
    if (!sessionDir) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return join(sessionDir, "chat.jsonl");
  }

  private findSessionDir(sessionId: string): string | null {
    const Paths = getPaths();
    if (!existsSync(Paths.projects)) {
      return null;
    }

    const { readdirSync } = require("fs");
    const projectEntries = readdirSync(Paths.projects, { withFileTypes: true });
    
    for (const projectEntry of projectEntries) {
      if (projectEntry.isDirectory()) {
        const sessionsDir = join(Paths.projects, projectEntry.name, "sessions");
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

  async saveMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const chatPath = this.getChatPath(sessionId);
    const line = JSON.stringify(message) + "\n";
    appendFileSync(chatPath, line, "utf-8");
  }

  async loadHistory(sessionId: string): Promise<ChatMessage[]> {
    try {
      const chatPath = this.getChatPath(sessionId);
      if (!existsSync(chatPath)) {
        return [];
      }

      const content = readFileSync(chatPath, "utf-8");
      const lines = content.trim().split("\n").filter(line => line);
      
      return lines.map((line) => JSON.parse(line) as ChatMessage);
    } catch {
      return [];
    }
  }

  async appendToHistory(sessionId: string, messages: ChatMessage[]): Promise<void> {
    const chatPath = this.getChatPath(sessionId);
    const lines = messages.map((msg) => JSON.stringify(msg)).join("\n") + "\n";
    appendFileSync(chatPath, lines, "utf-8");
  }

  async clearHistory(sessionId: string): Promise<void> {
    const chatPath = this.getChatPath(sessionId);
    if (existsSync(chatPath)) {
      const { unlinkSync } = require("fs");
      unlinkSync(chatPath);
    }
  }
}

export const chatService = new ChatService();
