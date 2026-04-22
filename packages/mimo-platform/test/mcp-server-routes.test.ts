import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createMcpRoutes } from "../src/mcp/server.js";
import { mcpTokenStore } from "../src/mcp/token-store.js";

describe("Platform MCP HTTP endpoint", () => {
  let workspacePath: string;
  let app: Hono;
  let sentMessages: string[];
  const sessionId = "session-mcp-1";
  const otherSessionId = "session-mcp-2";
  const token = "mcp-token-abc";

  beforeEach(() => {
    workspacePath = mkdtempSync(join(tmpdir(), "mimo-mcp-route-test-"));
    mkdirSync(join(workspacePath, "src"), { recursive: true });
    writeFileSync(join(workspacePath, "src", "hello.ts"), "export const hello = 1;\n");

    sentMessages = [];
    const wsClient = {
      readyState: 1,
      send: (msg: string) => sentMessages.push(msg),
    };
    const chatSessions = new Map<string, Set<{ readyState: number; send: (msg: string) => void }>>();
    chatSessions.set(sessionId, new Set([wsClient]));

    mcpTokenStore.register(token, sessionId);
    mcpTokenStore.register("mcp-token-other", otherSessionId);

    app = new Hono();
    app.route(
      "/api/mimo-mcp",
      createMcpRoutes({
        chatSessions,
        getSessionWorkspace: async (requestedSessionId: string) =>
          requestedSessionId === sessionId ? workspacePath : null,
      }),
    );
  });

  afterEach(() => {
    mcpTokenStore.revoke(token);
    mcpTokenStore.revoke("mcp-token-other");
    rmSync(workspacePath, { recursive: true, force: true });
  });

  it("3.9 valid token + valid path returns success and broadcasts", async () => {
    const res = await app.request("http://localhost/api/mimo-mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "tools/call",
        params: {
          name: "open_file",
          arguments: { path: "src/hello.ts" },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.success).toBe(true);
    expect(body.result.path).toBe("src/hello.ts");
    expect(sentMessages.length).toBe(1);
    const broadcastPayload = JSON.parse(sentMessages[0]);
    expect(broadcastPayload.type).toBe("open_file_in_editbuffer");
    expect(broadcastPayload.sessionId).toBe(sessionId);
    expect(broadcastPayload.path).toBe("src/hello.ts");
  });

  it("3.10 missing token returns 401", async () => {
    const res = await app.request("http://localhost/api/mimo-mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ method: "tools/list" }),
    });

    expect(res.status).toBe(401);
    expect(sentMessages.length).toBe(0);
  });

  it("3.11 outside-workspace path returns error result", async () => {
    const res = await app.request("http://localhost/api/mimo-mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "tools/call",
        params: {
          name: "open_file",
          arguments: { path: "../../etc/passwd" },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.success).toBe(false);
    expect(body.result.error).toContain("Access denied");
    expect(sentMessages.length).toBe(0);
  });

  it("3.12 nonexistent file returns error result", async () => {
    const res = await app.request("http://localhost/api/mimo-mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "tools/call",
        params: {
          name: "open_file",
          arguments: { path: "src/missing.ts" },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.success).toBe(false);
    expect(body.result.error).toContain("File not found");
    expect(sentMessages.length).toBe(0);
  });

  it("7.5 token from session A cannot act on session B", async () => {
    const res = await app.request("http://localhost/api/mimo-mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "tools/call",
        params: {
          name: "open_file",
          arguments: { path: "src/hello.ts", sessionId: otherSessionId },
        },
      }),
    });

    expect(res.status).toBe(401);
    expect(sentMessages.length).toBe(0);
  });
});
