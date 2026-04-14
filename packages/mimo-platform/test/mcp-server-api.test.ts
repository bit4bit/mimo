import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { existsSync, mkdirSync, rmdirSync, unlinkSync, readdirSync, writeFileSync } from "fs";
import { getPaths } from "../src/config/paths.js";
import type { McpServer } from "../src/mcp-servers/types.js";

const TEST_BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const AUTH_COOKIE = process.env.TEST_AUTH_COOKIE || "token=test-token; username=testuser";

describe("MCP Server API Integration Tests", () => {
  const testMcpServersPath = join(getPaths().root, "mcp-servers");

  function cleanupTestDir() {
    if (existsSync(testMcpServersPath)) {
      const entries = readdirSync(testMcpServersPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = join(testMcpServersPath, entry.name);
        if (entry.isDirectory()) {
          const files = readdirSync(entryPath);
          for (const file of files) {
            unlinkSync(join(entryPath, file));
          }
          rmdirSync(entryPath);
        } else {
          unlinkSync(entryPath);
        }
      }
    }
  }

  beforeAll(() => {
    cleanupTestDir();
  });

  afterAll(() => {
    cleanupTestDir();
  });

  describe("GET /mcp-servers", () => {
    it("should return empty array when no servers exist", async () => {
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers`, {
        headers: {
          Cookie: AUTH_COOKIE,
        },
      });

      expect(response.status).toBe(200);
      const servers = await response.json();
      expect(servers).toEqual([]);
    });

    it("should return list of MCP servers", async () => {
      // Create a test server directly
      const serverDir = join(testMcpServersPath, "test-server");
      mkdirSync(serverDir, { recursive: true });
      writeFileSync(
        join(serverDir, "config.yaml"),
        `id: test-server\nname: Test Server\ncommand: npx\nargs:\n  - -y\n  - @modelcontextprotocol/server-test\ncreatedAt: 2024-01-01T00:00:00Z\nupdatedAt: 2024-01-01T00:00:00Z\n`,
        "utf-8"
      );

      const response = await fetch(`${TEST_BASE_URL}/mcp-servers`, {
        headers: {
          Cookie: AUTH_COOKIE,
        },
      });

      expect(response.status).toBe(200);
      const servers = await response.json() as McpServer[];
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe("test-server");
      expect(servers[0].name).toBe("Test Server");
    });
  });

  describe("POST /mcp-servers", () => {
    it("should create a new MCP server", async () => {
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          name: "Filesystem Server",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
        }),
      });

      expect(response.status).toBe(201);
      const server = await response.json() as McpServer;
      expect(server.id).toBe("filesystem-server");
      expect(server.name).toBe("Filesystem Server");
      expect(server.command).toBe("npx");
      expect(server.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "."]);
    });

    it("should reject duplicate MCP server names", async () => {
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          name: "Filesystem Server",
          command: "npx",
          args: [],
        }),
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain("already exists");
    });

    it("should reject empty name", async () => {
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers`, {
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
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers`, {
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
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers/filesystem-server`, {
        headers: {
          Cookie: AUTH_COOKIE,
        },
      });

      expect(response.status).toBe(200);
      const server = await response.json() as McpServer;
      expect(server.id).toBe("filesystem-server");
      expect(server.name).toBe("Filesystem Server");
    });

    it("should return 404 for non-existent server", async () => {
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers/nonexistent`, {
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
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers/filesystem-server`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          args: ["/home/user/project"],
        }),
      });

      expect(response.status).toBe(200);
      const server = await response.json() as McpServer;
      expect(server.args).toEqual(["/home/user/project"]);
    });

    it("should update MCP server name without changing ID", async () => {
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers/filesystem-server`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: AUTH_COOKIE,
        },
        body: JSON.stringify({
          name: "Project Filesystem",
        }),
      });

      expect(response.status).toBe(200);
      const server = await response.json() as McpServer;
      expect(server.name).toBe("Project Filesystem");
      expect(server.id).toBe("filesystem-server");
    });

    it("should return 404 for non-existent server", async () => {
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers/nonexistent`, {
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
      // Create a server to delete
      await fetch(`${TEST_BASE_URL}/mcp-servers`, {
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

      const response = await fetch(`${TEST_BASE_URL}/mcp-servers/delete-me`, {
        method: "DELETE",
        headers: {
          Cookie: AUTH_COOKIE,
        },
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);

      // Verify it's gone
      const getResponse = await fetch(`${TEST_BASE_URL}/mcp-servers/delete-me`, {
        headers: {
          Cookie: AUTH_COOKIE,
        },
      });
      expect(getResponse.status).toBe(404);
    });

    it("should return 404 for non-existent server", async () => {
      const response = await fetch(`${TEST_BASE_URL}/mcp-servers/nonexistent`, {
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
