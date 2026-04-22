import { describe, it, expect } from "bun:test";
import { createSessionDeletionUseCase } from "../src/sessions/session-deletion.js";

describe("session deletion revokes MCP token", () => {
  it("calls mcpTokenStore.revoke when mcpToken is present", async () => {
    const revoked: string[] = [];
    const useCase = createSessionDeletionUseCase({
      sessionRepository: {
        delete: async () => {},
      },
      sessionStateService: {
        clearSessionState: () => {},
      },
      fileSyncService: {
        cleanupSession: async () => {},
      },
      impactCalculator: {
        clearState: () => {},
      },
      agentService: {
        notifySessionEnded: async () => {},
      },
      mcpTokenStore: {
        revoke: (token: string) => revoked.push(token),
      },
    });

    await useCase.deleteSessionByRecord({
      id: "session-1",
      projectId: "project-1",
      assignedAgentId: undefined,
      mcpToken: "token-1",
    });

    expect(revoked).toEqual(["token-1"]);
  });
});
