import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServerService } from "../src/mcp-servers/service.js";
import { McpServerRepository } from "../src/mcp-servers/repository.js";
import { existsSync, rmdirSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { getPaths } from "../src/config/paths.js";

describe("McpServerService", () => {
  let service: McpServerService;
  let repository: McpServerRepository;
  const testMcpServersPath = join(getPaths().root, "mcp-servers");

  beforeEach(() => {
    repository = new McpServerRepository();
    service = new McpServerService(repository);
    cleanupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

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

  describe("create", () => {
    it("should create an MCP server with validation", async () => {
      const server = await service.create({
        name: "Test Server",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-test"],
      });

      expect(server.id).toBe("test-server");
      expect(server.name).toBe("Test Server");
      expect(server.transport).toBe("stdio");
      expect(server.command).toBe("npx");
    });

    it("should create an HTTP MCP server", async () => {
      const server = await service.create({
        name: "Remote Server",
        description: "Remote HTTP endpoint",
        transport: "http",
        url: "http://localhost:3001/mcp",
        headers: { Authorization: "Bearer token123" },
      });

      expect(server.id).toBe("remote-server");
      expect(server.transport).toBe("http");
      expect(server.url).toBe("http://localhost:3001/mcp");
      expect(server.command).toBeUndefined();
    });

    it("should throw error for empty name", async () => {
      try {
        await service.create({
          name: "",
          transport: "stdio",
          command: "npx",
          args: [],
        });
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toBe("Name is required");
      }
    });

    it("should throw error for missing transport", async () => {
      try {
        await service.create({
          name: "Test Server",
          transport: undefined as any,
          command: "npx",
          args: [],
        });
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toBe("Transport type is required");
      }
    });

    it("should throw error for empty command with stdio transport", async () => {
      try {
        await service.create({
          name: "Test Server",
          transport: "stdio",
          command: "",
          args: [],
        });
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toBe("Command is required for stdio transport");
      }
    });

    it("should throw error for empty URL with HTTP transport", async () => {
      try {
        await service.create({
          name: "Test Server",
          transport: "http",
          url: "",
        });
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toBe("URL is required for HTTP/SSE transport");
      }
    });

    it("should throw error for duplicate name", async () => {
      await service.create({
        name: "Unique Server",
        transport: "stdio",
        command: "npx",
        args: [],
      });

      try {
        await service.create({
          name: "Unique Server",
          transport: "stdio",
          command: "node",
          args: [],
        });
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toContain("already exists");
      }
    });

    it("should trim whitespace from inputs", async () => {
      const server = await service.create({
        name: "  Trimmed Server  ",
        transport: "stdio",
        command: "  npx  ",
        args: ["arg1", "arg2"],
      });

      expect(server.name).toBe("Trimmed Server");
      expect(server.command).toBe("npx");
    });
  });

  describe("update", () => {
    it("should update an MCP server", async () => {
      await service.create({
        name: "Update Test",
        transport: "stdio",
        command: "npx",
        args: ["old"],
      });

      const updated = await service.update("update-test", {
        args: ["new"],
      });

      expect(updated?.args).toEqual(["new"]);
    });

    it("should update HTTP transport fields", async () => {
      await service.create({
        name: "HTTP Test",
        transport: "http",
        url: "http://old.com",
      });

      const updated = await service.update("http-test", {
        url: "http://new.com",
        headers: { Authorization: "new-token" },
      });

      expect(updated?.url).toBe("http://new.com");
    });

    it("should throw error when updating to empty name", async () => {
      await service.create({
        name: "Update Test",
        transport: "stdio",
        command: "npx",
        args: [],
      });

      try {
        await service.update("update-test", {
          name: "",
        });
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toBe("Name is required");
      }
    });

    it("should throw error when updating to duplicate name", async () => {
      await service.create({
        name: "First Server",
        transport: "stdio",
        command: "npx",
        args: [],
      });

      await service.create({
        name: "Second Server",
        transport: "stdio",
        command: "node",
        args: [],
      });

      try {
        await service.update("second-server", {
          name: "First Server",
        });
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toContain("already exists");
      }
    });

    it("should return null for non-existent server", async () => {
      const updated = await service.update("nonexistent", {
        command: "node",
      });
      expect(updated).toBeNull();
    });
  });

  describe("resolveMcpServers", () => {
    it("should resolve stdio MCP server IDs to configs", async () => {
      await service.create({
        name: "Filesystem",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      });

      await service.create({
        name: "GitHub",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      });

      const configs = await service.resolveMcpServers(["filesystem", "github"]);

      expect(configs).toHaveLength(2);
      expect(configs[0]).toEqual({
        name: "Filesystem",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      });
      expect(configs[1]).toEqual({
        name: "GitHub",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      });
    });

    it("should resolve HTTP MCP server to config", async () => {
      await service.create({
        name: "Remote",
        transport: "http",
        url: "http://localhost:3001/mcp",
        headers: { Authorization: "Bearer token123" },
      });

      const configs = await service.resolveMcpServers(["remote"]);

      expect(configs).toHaveLength(1);
      expect(configs[0]).toEqual({
        name: "Remote",
        transport: "http",
        url: "http://localhost:3001/mcp",
        headers: [{ name: "Authorization", value: "Bearer token123" }],
      });
    });

    it("should throw error for non-existent MCP server", async () => {
      try {
        await service.resolveMcpServers(["nonexistent"]);
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toBe("MCP server 'nonexistent' not found");
      }
    });

    it("should return empty array for empty input", async () => {
      const configs = await service.resolveMcpServers([]);
      expect(configs).toEqual([]);
    });
  });

  describe("findDuplicateNames", () => {
    it("should return null when no duplicates", async () => {
      await service.create({
        name: "Unique One",
        transport: "stdio",
        command: "npx",
        args: [],
      });

      await service.create({
        name: "Unique Two",
        transport: "stdio",
        command: "node",
        args: [],
      });

      const duplicate = await service.findDuplicateNames(["unique-one", "unique-two"]);
      expect(duplicate).toBeNull();
    });
  });

  describe("CRUD operations", () => {
    it("should find all MCP servers", async () => {
      await service.create({
        name: "Server A",
        transport: "stdio",
        command: "npx",
        args: [],
      });

      await service.create({
        name: "Server B",
        transport: "http",
        url: "http://example.com",
      });

      const servers = await service.findAll();
      expect(servers).toHaveLength(2);
    });

    it("should find MCP server by ID", async () => {
      await service.create({
        name: "Findable",
        transport: "stdio",
        command: "npx",
        args: [],
      });

      const server = await service.findById("findable");
      expect(server).not.toBeNull();
      expect(server?.name).toBe("Findable");
    });

    it("should delete MCP server", async () => {
      await service.create({
        name: "Deletable",
        transport: "stdio",
        command: "npx",
        args: [],
      });

      const result = await service.delete("deletable");
      expect(result).toBe(true);

      const server = await service.findById("deletable");
      expect(server).toBeNull();
    });
  });
});
