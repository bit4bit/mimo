import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServerRepository } from "../src/mcp-servers/repository.js";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("McpServerRepository", () => {
  let repository: McpServerRepository;
  const testHome = join(tmpdir(), `mimo-mcp-repo-test-${Date.now()}`);

  beforeEach(() => {
    process.env.MIMO_HOME = testHome;
    repository = new McpServerRepository();
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
    delete process.env.MIMO_HOME;
  });

  describe("create", () => {
    it("should create an MCP server with slugified ID", async () => {
      const input = {
        name: "GitHub API",
        description: "Access to GitHub API",
        transport: "stdio" as const,
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      };

      const server = await repository.create(input);

      expect(server.id).toBe("github-api");
      expect(server.name).toBe("GitHub API");
      expect(server.transport).toBe("stdio");
      expect(server.command).toBe("npx");
      expect(server.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
      expect(server.createdAt).toBeInstanceOf(Date);
      expect(server.updatedAt).toBeInstanceOf(Date);
    });

    it("should create an MCP server with HTTP transport", async () => {
      const input = {
        name: "Remote HTTP",
        description: "Remote MCP server",
        transport: "http" as const,
        url: "http://localhost:3001/mcp",
        headers: { Authorization: "Bearer token123" },
      };

      const server = await repository.create(input);

      expect(server.id).toBe("remote-http");
      expect(server.transport).toBe("http");
      expect(server.url).toBe("http://localhost:3001/mcp");
      expect(server.command).toBeUndefined();
      expect(server.args).toBeUndefined();
    });

    it("should throw error for duplicate name", async () => {
      const input = {
        name: "Filesystem",
        transport: "stdio" as const,
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      };

      await repository.create(input);

      try {
        await repository.create(input);
        expect(false).toBe(true); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain("already exists");
      }
    });

    it("should slugify special characters", async () => {
      const input = {
        name: "My   Server!!!",
        transport: "stdio" as const,
        command: "node",
        args: ["server.js"],
      };

      const server = await repository.create(input);
      expect(server.id).toBe("my-server");
    });
  });

  describe("findById", () => {
    it("should find an existing MCP server", async () => {
      const input = {
        name: "PostgreSQL",
        transport: "stdio" as const,
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
      };

      await repository.create(input);
      const found = await repository.findById("postgresql");

      expect(found).not.toBeNull();
      expect(found?.name).toBe("PostgreSQL");
      expect(found?.transport).toBe("stdio");
    });

    it("should return null for non-existent server", async () => {
      const found = await repository.findById("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("findAll", () => {
    it("should return empty array when no servers exist", async () => {
      const servers = await repository.findAll();
      expect(servers).toEqual([]);
    });

    it("should return all MCP servers sorted by name", async () => {
      await repository.create({
        name: "Zebra Server",
        transport: "stdio" as const,
        command: "node",
        args: ["zebra.js"],
      });

      await repository.create({
        name: "Alpha Server",
        transport: "stdio" as const,
        command: "node",
        args: ["alpha.js"],
      });

      const servers = await repository.findAll();

      expect(servers).toHaveLength(2);
      expect(servers[0].name).toBe("Alpha Server");
      expect(servers[1].name).toBe("Zebra Server");
    });
  });

  describe("update", () => {
    it("should update an MCP server", async () => {
      await repository.create({
        name: "Filesystem",
        transport: "stdio" as const,
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      });

      const updated = await repository.update("filesystem", {
        args: ["/home/user/project"],
      });

      expect(updated).not.toBeNull();
      expect(updated?.args).toEqual(["/home/user/project"]);
      expect(updated?.id).toBe("filesystem"); // ID unchanged
    });

    it("should update the name without changing ID", async () => {
      await repository.create({
        name: "Filesystem",
        transport: "stdio" as const,
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      });

      const updated = await repository.update("filesystem", {
        name: "Project Files",
      });

      expect(updated?.name).toBe("Project Files");
      expect(updated?.id).toBe("filesystem");
    });

    it("should return null for non-existent server", async () => {
      const updated = await repository.update("nonexistent", {
        command: "node",
      });
      expect(updated).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete an MCP server", async () => {
      await repository.create({
        name: "Temp Server",
        transport: "stdio" as const,
        command: "node",
        args: ["temp.js"],
      });

      const result = await repository.delete("temp-server");
      expect(result).toBe(true);

      const found = await repository.findById("temp-server");
      expect(found).toBeNull();
    });

    it("should return false for non-existent server", async () => {
      const result = await repository.delete("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("exists", () => {
    it("should return true for existing server", async () => {
      await repository.create({
        name: "Test Server",
        transport: "stdio" as const,
        command: "node",
        args: ["test.js"],
      });

      const exists = await repository.exists("test-server");
      expect(exists).toBe(true);
    });

    it("should return false for non-existent server", async () => {
      const exists = await repository.exists("nonexistent");
      expect(exists).toBe(false);
    });
  });
});
