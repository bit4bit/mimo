// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createMcpServerRoutes } from "../src/mcp-servers/routes.js";
import { MimoServer } from "../src/server/mimo-server.js";
import type { McpServer } from "../src/mcp-servers/types.js";

const AUTH_COOKIE = "username=testuser; token=test-token";

describe("MCP Server API Integration Tests", () => {
  let server: any;
  let testBaseUrl = "";
  let testHome = "";
  let mimoContext: any;

  function cleanupTestDir() {
    const testMcpServersPath = join(
      mimoContext?.paths?.root || "/tmp",
      "mcp-servers",
    );
    if (!existsSync(testMcpServersPath)) {
      return;
    }

    const entries = readdirSync(testMcpServersPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(testMcpServersPath, entry.name);
      if (entry.isDirectory()) {
        rmSync(entryPath, { recursive: true, force: true });
      } else {
        unlinkSync(entryPath);
      }
    }
  }

  beforeAll(async () => {
    testHome = mkdtempSync(join(tmpdir(), "mimo-mcp-api-test-"));

    // Set environment variable for MIMO_HOME
    process.env.MIMO_HOME = testHome;

    // Initialize mimoContext for path access
    const { createMimoContext } = await import("../src/context/mimo-context");
    mimoContext = createMimoContext({ env: { MIMO_HOME: testHome } });

    const app = new Hono();
    app.route("/mcp-servers", createMcpServerRoutes(mimoContext));

    const mimoServer = new MimoServer({
      serve: (config) => Bun.serve(config as any) as any,
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
      ensureSharedFossilRunning: async () => true,
      getSharedFossilPort: () => 0,
      logger: { log: () => {}, error: () => {} },
    });

    mimoServer.setup({
      fetch: (req) => app.fetch(req),
      port: 0,
      websocket: {
        message: () => {},
        open: () => {},
        close: () => {},
      },
    });

    server = mimoServer.start();
    testBaseUrl = `http://localhost:${server.port}`;
    cleanupTestDir();
  });

  afterAll(() => {
    cleanupTestDir();
    server?.stop?.(true);
    if (testHome) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  describe("GET /mcp-servers", () => {
    it("should return empty array when no servers exist", async () => {
      const response = await fetch(`${testBaseUrl}/mcp-servers`, {
        headers: {
          Cookie: AUTH_COOKIE,
          Accept: "application/json",
        },
      });

      expect(response.status).toBe(200);
      const servers = await response.json();
      expect(servers).toEqual([]);
    });

    it("should return list of MCP servers", async () => {
      const createResponse = await fetch(`${testBaseUrl}/mcp-servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          name: "Test Server",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-test"],
        }),
      });

      expect(createResponse.status).toBe(201);

      const response = await fetch(`${testBaseUrl}/mcp-servers`, {
        headers: {
          Cookie: AUTH_COOKIE,
          Accept: "application/json",
        },
      });

      expect(response.status).toBe(200);
      const servers = (await response.json()) as McpServer[];
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe("test-server");
      expect(servers[0].name).toBe("Test Server");
    });
  });

  describe("POST /mcp-servers", () => {
    it("should create a new MCP server", async () => {
      const response = await fetch(`${testBaseUrl}/mcp-servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          name: "PostgreSQL Server",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-postgres"],
        }),
      });

      expect(response.status).toBe(201);
      const created = (await response.json()) as McpServer;
      expect(created.id).toBe("postgresql-server");
      expect(created.name).toBe("PostgreSQL Server");
      expect(created.command).toBe("npx");
      expect(created.args).toEqual([
        "-y",
        "@modelcontextprotocol/server-postgres",
      ]);
    });

    it("should reject duplicate MCP server names", async () => {
      const response = await fetch(`${testBaseUrl}/mcp-servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          name: "PostgreSQL Server",
          command: "npx",
          args: [],
        }),
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain("already exists");
    });

    it("should reject empty name", async () => {
      const response = await fetch(`${testBaseUrl}/mcp-servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          name: "",
          command: "npx",
          args: [],
        }),
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain("required");
    });

    it("should reject empty command", async () => {
      const response = await fetch(`${testBaseUrl}/mcp-servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          name: "New Server",
          command: "",
          args: [],
        }),
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain("required");
    });
  });

  describe("GET /mcp-servers/:id", () => {
    it("should return a specific MCP server", async () => {
      const response = await fetch(
        `${testBaseUrl}/mcp-servers/postgresql-server`,
        {
          headers: {
            Cookie: AUTH_COOKIE,
          },
        },
      );

      expect(response.status).toBe(200);
      const found = (await response.json()) as McpServer;
      expect(found.id).toBe("postgresql-server");
      expect(found.name).toBe("PostgreSQL Server");
    });

    it("should return 404 for non-existent server", async () => {
      const response = await fetch(`${testBaseUrl}/mcp-servers/nonexistent`, {
        headers: {
          Cookie: AUTH_COOKIE,
        },
      });

      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.error).toBe("MCP server not found");
    });
  });

  describe("PATCH /mcp-servers/:id", () => {
    it("should update an MCP server", async () => {
      const response = await fetch(
        `${testBaseUrl}/mcp-servers/postgresql-server`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: AUTH_COOKIE,
          },
          body: JSON.stringify({
            args: ["postgresql://localhost/db"],
          }),
        },
      );

      expect(response.status).toBe(200);
      const updated = (await response.json()) as McpServer;
      expect(updated.args).toEqual(["postgresql://localhost/db"]);
    });

    it("should update MCP server name without changing ID", async () => {
      const response = await fetch(
        `${testBaseUrl}/mcp-servers/postgresql-server`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: AUTH_COOKIE,
          },
          body: JSON.stringify({
            name: "Production Database",
          }),
        },
      );

      expect(response.status).toBe(200);
      const updated = (await response.json()) as McpServer;
      expect(updated.name).toBe("Production Database");
      expect(updated.id).toBe("postgresql-server");
    });

    it("should return 404 for non-existent server", async () => {
      const response = await fetch(`${testBaseUrl}/mcp-servers/nonexistent`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          command: "node",
        }),
      });

      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.error).toBe("MCP server not found");
    });
  });

  describe("DELETE /mcp-servers/:id", () => {
    it("should delete an MCP server", async () => {
      await fetch(`${testBaseUrl}/mcp-servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          name: "Delete Me",
          command: "npx",
          args: [],
        }),
      });

      const response = await fetch(`${testBaseUrl}/mcp-servers/delete-me`, {
        method: "DELETE",
        headers: {
          Cookie: AUTH_COOKIE,
        },
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);

      const getResponse = await fetch(`${testBaseUrl}/mcp-servers/delete-me`, {
        headers: {
          Cookie: AUTH_COOKIE,
        },
      });
      expect(getResponse.status).toBe(404);
    });

    it("should return 404 for non-existent server", async () => {
      const response = await fetch(`${testBaseUrl}/mcp-servers/nonexistent`, {
        method: "DELETE",
        headers: {
          Cookie: AUTH_COOKIE,
        },
      });

      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.error).toBe("MCP server not found");
    });
  });
});
