// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";
import { McpTokenStore } from "../src/mcp/token-store.js";

describe("McpTokenStore", () => {
  const store = new McpTokenStore();

  describe("register and resolve", () => {
    it("2.2: register adds token → sessionId mapping", () => {
      store.register("token-abc-123", "session-xyz");
      expect(store.resolve("token-abc-123")).toBe("session-xyz");
    });

    it("2.3: resolve returns sessionId for valid token", () => {
      store.register("token-def-456", "session-mno");
      expect(store.resolve("token-def-456")).toBe("session-mno");
    });

    it("2.3: resolve returns null for unknown token", () => {
      expect(store.resolve("unknown-token")).toBeNull();
    });
  });

  describe("revoke", () => {
    it("2.4: revoke removes token mapping", () => {
      store.register("token-revoke-test", "session-revoked");
      expect(store.resolve("token-revoke-test")).toBe("session-revoked");
      store.revoke("token-revoke-test");
      expect(store.resolve("token-revoke-test")).toBeNull();
    });
  });

  describe("populateFromSessions", () => {
    it("2.6: populates from sessions array", () => {
      const freshStore = new McpTokenStore();
      const sessions = [
        { id: "session-a", mcpToken: "uuid-a" },
        { id: "session-b", mcpToken: "uuid-b" },
        { id: "session-c", mcpToken: undefined as any },
      ];
      freshStore.populateFromSessions(sessions);
      expect(freshStore.resolve("uuid-a")).toBe("session-a");
      expect(freshStore.resolve("uuid-b")).toBe("session-b");
      expect(freshStore.resolve("unknown")).toBeNull();
    });
  });
});