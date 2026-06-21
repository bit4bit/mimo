// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Runtime enforcement of agent-sharing revocation (gate 3).
 *
 * When the session owner sends a prompt on a thread assigned to an agent they
 * are no longer authorized to use, the prompt is declined and a system message
 * is posted to the thread instead of being routed to the agent.
 */

import { describe, it, expect } from "bun:test";
import { createWebSocketHandlers } from "./handlers.js";

interface SentMessage {
  send: (m: string) => void;
  readyState: number;
}

function makeDeps(agent: any, session: any) {
  const clientSent: string[] = [];
  const client: SentMessage = {
    readyState: 1,
    send: (m: string) => clientSent.push(m),
  };
  const chatSessions = new Map<string, Set<SentMessage>>();
  chatSessions.set(session.id, new Set([client]));

  const agentWsSent: string[] = [];
  const agentWs: SentMessage = {
    readyState: 1,
    send: (m: string) => agentWsSent.push(m),
  };

  const savedMessages: any[] = [];

  const deps: any = {
    sessionRepository: {
      findById: async () => session,
      touchSessionActivity: async () => {},
    },
    agentService: {
      getAgentStatus: async () => agent,
      getAgentConnection: () => agentWs,
    },
    chatService: {
      saveMessage: async (_s: string, msg: any) => {
        savedMessages.push(msg);
      },
    },
    chatSessions,
    // Unused by the send_message path under test:
    agentRouter: {},
    pipeline: {},
    fileWatchSessions: new Map(),
    calculatingSessions: new Set(),
    sccService: {},
    impactCalculator: {},
    fileWatcher: {},
    fileService: {},
  };

  return { deps, clientSent, agentWsSent, savedMessages };
}

const session = {
  id: "s1",
  owner: "bob",
  activeChatThreadId: "t1",
  chatThreads: [{ id: "t1", assignedAgentId: "agent-alice" }],
};

function sendMessage(handlers: any) {
  return handlers.handleChatMessage(
    { data: { sessionId: "s1" } },
    {
      type: "send_message",
      promptId: "p1",
      chatThreadId: "t1",
      content: "hello",
    },
  );
}

describe("agent share revocation (gate 3)", () => {
  it("declines the prompt and posts a system message when access is revoked", async () => {
    const revokedAgent = {
      id: "agent-alice",
      owner: "alice",
      sharedWith: [], // bob revoked
    };
    const { deps, clientSent, agentWsSent, savedMessages } = makeDeps(
      revokedAgent,
      session,
    );
    const handlers = createWebSocketHandlers(deps);

    await sendMessage(handlers);

    // The prompt was not routed to the agent.
    const routed = agentWsSent
      .map((m) => JSON.parse(m))
      .filter((m) => m.type === "user_message");
    expect(routed.length).toBe(0);

    // A system message was broadcast and saved to the thread.
    const systemBroadcast = clientSent
      .map((m) => JSON.parse(m))
      .find((m) => m.role === "system");
    expect(systemBroadcast).toBeDefined();
    expect(systemBroadcast.content).toContain("no longer have access");
    expect(savedMessages.some((m) => m.role === "system")).toBe(true);
  });

  it("routes the prompt when the user still has access", async () => {
    const sharedAgent = {
      id: "agent-alice",
      owner: "alice",
      sharedWith: [{ username: "bob", permission: "use" }],
    };
    const { deps, agentWsSent } = makeDeps(sharedAgent, session);
    const handlers = createWebSocketHandlers(deps);

    await sendMessage(handlers);

    const routed = agentWsSent
      .map((m) => JSON.parse(m))
      .filter((m) => m.type === "user_message");
    expect(routed.length).toBe(1);
  });
});
