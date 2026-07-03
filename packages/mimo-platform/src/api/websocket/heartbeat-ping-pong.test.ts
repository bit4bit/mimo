// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Chat WebSocket heartbeat: the server replies to an application-level
 * `ping` with a `pong` so the client can detect a dead/half-open socket.
 *
 * Part of change: fix-chat-missed-response-recovery
 * (capability: chat-connection-reliability).
 */

import { describe, it, expect } from "bun:test";
import { createWebSocketHandlers } from "./handlers.js";

interface SentMessage {
  send: (m: string) => void;
  readyState: number;
}

function makeHandlers() {
  const clientSent: string[] = [];
  const client: SentMessage = {
    readyState: 1,
    send: (m: string) => clientSent.push(m),
  };

  const deps: any = {
    sessionRepository: { findById: async () => null },
    agentService: {},
    chatService: {},
    chatSessions: new Map<string, Set<SentMessage>>(),
    agentRouter: {},
    pipeline: {},
    fileWatchSessions: new Map(),
    calculatingSessions: new Set(),
    sccService: {},
    impactCalculator: {},
    fileWatcher: {},
    fileService: {},
  };

  const handlers = createWebSocketHandlers(deps);
  const ws = { data: { sessionId: "s1" }, send: client.send, readyState: 1 };
  return { handlers, ws, clientSent };
}

describe("chat websocket heartbeat", () => {
  it("replies with pong when it receives a ping", async () => {
    const { handlers, ws, clientSent } = makeHandlers();

    await handlers.handleChatMessage(ws, { type: "ping" });

    const pong = clientSent
      .map((m) => JSON.parse(m))
      .find((m) => m.type === "pong");
    expect(pong).toBeDefined();
  });

  it("does not send a pong for unrelated message types", async () => {
    const { handlers, ws, clientSent } = makeHandlers();

    await handlers.handleChatMessage(ws, { type: "some_unknown_type" });

    const pong = clientSent
      .map((m) => JSON.parse(m))
      .find((m) => m.type === "pong");
    expect(pong).toBeUndefined();
  });
});
