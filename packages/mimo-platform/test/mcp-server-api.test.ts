import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Hono } from "hono";
import { existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createMcpServerRoutes } from "../src/mcp-servers/routes.js";
import type { McpServer } from "../src/mcp-servers/types.js";

let mimoContext: any;
let testHome: string;
let authToken: string;

// Helper to create test app with internal API mounted
function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/internal/index.ts");
  const { createMcpServerRoutes } = require("../src/mcp-servers/routes.js");

  const app = new Hono();

  // Mount internal API
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

  // Mount MCP server routes with fetchFn that routes through app
  const mcpServers = createMcpServerRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const path = new URL(urlStr).pathname;
        return app.request(path, init);
      }
      return fetch(url, init);
    },
  });
  app.route("/mcp-servers", mcpServers);

  return app;
}

describe("MCP Server API Integration Tests", () => {
  let app: Hono;

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

    // Initialize mimoContext with proper JWT_SECRET
    const { createMimoContext } = await import("../src/context/mimo-context");
    mimoContext = createMimoContext({ 
      env: { 
        MIMO_HOME: testHome,
        JWT_SECRET: "test-secret-key-for-mcp-tests",
      } 
    });

    // Create a valid auth token
    authToken = await mimoContext.services.auth.generateToken("testuser");

    app = createTestApp(mimoContext);
    cleanupTestDir();
  });

  beforeEach(() => {
    cleanupTestDir();
  });

  afterAll(() => {
    cleanupTestDir();
    if (testHome) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  describe("GET /mcp-servers", () => {
    it("should return empty array when no servers exist", async () => {
      const response = await app.request("/mcp-servers", {
        headers: {
          Cookie: `token=${authToken}`,
          Accept: "application/json",
        },
      });

      expect(response.status).toBe(200);
      const servers = await response.json();
      expect(servers).toEqual([]);
    });

    it("should return list of MCP servers", async () => {
      const createResponse = await app.request("/mcp-servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          name: "Test Server",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-test"],
        }),
      });

      expect(createResponse.status).toBe(201);

      const response = await app.request("/mcp-servers", {
        headers: {
          Cookie: `token=${authToken}`,
          Accept: "application/json",
        },
      });

      expect(response.status).toBe(200);
      const servers = (await response.json()) as McpServer[];
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe("Test Server");
    });
  });

  describe("POST /mcp-servers", () => {
    it("should create a new MCP server", async () => {
      const response = await app.request("/mcp-servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          name: "PostgreSQL Server",
          transport: "stdio",
                    command: "npx",
          args: ["-y", "@modelcontextprotocol/server-postgres"],
        }),
      });

      expect(response.status).toBe(201);
      const created = (await response.json()) as McpServer;
      expect(created.name).toBe("PostgreSQL Server");
      expect(created.command).toBe("npx");
      expect(created.args).toEqual([
        "-y",
        "@modelcontextprotocol/server-postgres",
      ]);
    });

    it("should reject duplicate MCP server names", async () => {
      // First create a server
      await app.request("/mcp-servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          name: "Unique Server",
          transport: "stdio",
                    command: "npx",
          args: [],
        }),
      });

      // Try to create another with same name
      const response = await app.request("/mcp-servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          name: "Unique Server",
          transport: "stdio",
                    command: "npx",
          args: [],
        }),
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain("already exists");
    });

    it("should reject empty name", async () => {
      const response = await app.request("/mcp-servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
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
      const response = await app.request("/mcp-servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          name: "New Server",
          transport: "stdio",
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
      // Create a server first
      const createRes = await app.request("/mcp-servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          name: "Gettable Server",
          transport: "stdio",
                    command: "npx",
          args: [],
        }),
      });
      const created = await createRes.json() as McpServer;

      const response = await app.request(`/mcp-servers/${created.id}`, {
        headers: {
          Cookie: `token=${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const found = (await response.json()) as McpServer;
      expect(found.name).toBe("Gettable Server");
    });

    it("should return 404 for non-existent server", async () => {
      const response = await app.request("/mcp-servers/nonexistent-xyz", {
        headers: {
          Cookie: `token=${authToken}`,
        },
      });

      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.error).toBe("MCP server not found");
    });
  });

  describe("PATCH /mcp-servers/:id", () => {
    it("should update an MCP server", async () => {
      // Create a server first
      const createRes = await app.request("/mcp-servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          name: "Updatable Server",
          transport: "stdio",
                    command: "npx",
          args: [],
        }),
      });
      const created = await createRes.json() as McpServer;

      const response = await app.request(`/mcp-servers/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          args: ["postgresql://localhost/db"],
        }),
      });

      expect(response.status).toBe(200);
      const updated = (await response.json()) as McpServer;
      expect(updated.args).toEqual(["postgresql://localhost/db"]);
    });

    it("should update MCP server name without changing ID", async () => {
      // Create a server first
      const createRes = await app.request("/mcp-servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          name: "Original Name",
          transport: "stdio",
                    command: "npx",
          args: [],
        }),
      });
      const created = await createRes.json() as McpServer;
      const originalId = created.id;

      const response = await app.request(`/mcp-servers/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          name: "Production Database",
        }),
      });

      expect(response.status).toBe(200);
      const updated = (await response.json()) as McpServer;
      expect(updated.name).toBe("Production Database");
      expect(updated.id).toBe(originalId);
    });

    it("should return 404 for non-existent server", async () => {
      const response = await app.request("/mcp-servers/nonexistent-xyz", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
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
      // Create a server first
      const createRes = await app.request("/mcp-servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${authToken}`,
        },
        body: JSON.stringify({
          name: "Delete Me",
          transport: "stdio",
                    command: "npx",
          args: [],
        }),
      });
      const created = await createRes.json() as McpServer;

      const response = await app.request(`/mcp-servers/${created.id}`, {
        method: "DELETE",
        headers: {
          Cookie: `token=${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);

      // Verify it's gone
      const getResponse = await app.request(`/mcp-servers/${created.id}`, {
        headers: {
          Cookie: `token=${authToken}`,
        },
      });
      expect(getResponse.status).toBe(404);
    });

    it("should return 404 for non-existent server", async () => {
      const response = await app.request("/mcp-servers/nonexistent-xyz", {
        method: "DELETE",
        headers: {
          Cookie: `token=${authToken}`,
        },
      });

      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.error).toBe("MCP server not found");
    });
  });
});
