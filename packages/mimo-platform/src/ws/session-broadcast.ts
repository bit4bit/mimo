// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

export interface SessionWsClient {
  readyState: number;
  send: (message: string) => void;
}

export function broadcastToSession(
  chatSessions: Map<string, Set<SessionWsClient>>,
  sessionId: string,
  message: Record<string, unknown>,
): void {
  const subscribers = chatSessions.get(sessionId);
  if (!subscribers) {
    return;
  }

  subscribers.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(message));
    }
  });
}
