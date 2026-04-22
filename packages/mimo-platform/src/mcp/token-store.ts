export class McpTokenStore {
  private tokens: Map<string, string> = new Map();

  register(token: string, sessionId: string): void {
    this.tokens.set(token, sessionId);
  }

  resolve(token: string): string | null {
    return this.tokens.get(token) ?? null;
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }

  populateFromSessions(
    sessions: Array<{ id: string; mcpToken?: string }>,
  ): void {
    for (const session of sessions) {
      if (session.mcpToken) {
        this.tokens.set(session.mcpToken, session.id);
      }
    }
  }
}

export const mcpTokenStore = new McpTokenStore();