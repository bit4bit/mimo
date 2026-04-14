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
      rmdirSync(testMcpServersPath);
    }
  }

  describe("create", () => {
    it("should create an MCP server with validation", async () => {
      const server = await service.create({
        name: "Test Server",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-test"],
      });

      expect(server.id).toBe("test-server");
      expect(server.name).toBe("Test Server");
      expect(server.command).toBe("npx");
    });

    it("should throw error for empty name", async () => {
      try {
        await service.create({
          name: "",
          command: "npx",
          args: [],
        });
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toBe("Name is required");
      }
    });

    it("should throw error for empty command", async () => {
      try {
        await service.create({
          name: "Test Server",
          command: "",
          args: [],
        });
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toBe("Command is required");
      }
    });

    it("should throw error for duplicate name", async () => {
      await service.create({
        name: "Unique Server",
        command: "npx",
        args: [],
      });

      try {
        await service.create({
          name: "Unique Server",
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
        command: "npx",
        args: ["old"],
      });

      const updated = await service.update("update-test", {
        args: ["new"],
      });

      expect(updated?.args).toEqual(["new"]);
    });

    it("should throw error when updating to empty name", async () => {
      await service.create({
        name: "Update Test",
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
        command: "npx",
        args: [],
      });

      await service.create({
        name: "Second Server",
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

    it("should allow updating to same name", async () => {
      await service.create({
        name: "Same Name",
        command: "npx",
        args: [],
      });

      const updated = await service.update("same-name", {
        name: "Same Name",
        command: "node",
      });

      expect(updated?.name).toBe("Same Name");
      expect(updated?.command).toBe("node");
    });

    it("should return null for non-existent server", async () => {
      const updated = await service.update("nonexistent", {
        command: "node",
      });
      expect(updated).toBeNull();
    });
  });

  describe("resolveMcpServers", () => {
    it("should resolve MCP server IDs to configs", async () => {
      await service.create({
        name: "Filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      });

      await service.create({
        name: "GitHub",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      });

      const configs = await service.resolveMcpServers(["filesystem", "github"]);

      expect(configs).toHaveLength(2);
      expect(configs[0]).toEqual({
        name: "Filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      });
      expect(configs[1]).toEqual({
        name: "GitHub",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
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
    it("should find duplicate MCP server names", async () => {
      // Create servers directly through repository to bypass validation
      // This simulates the scenario where two servers have the same display name
      await repository.create({
        name: "Same Name",
        command: "npx",
        args: [],
      });

      // Create another with same name but different ID (bypassing service validation)
      const { slugify } = await import("../src/mcp-servers/types.js");
      const id2 = slugify("Same Name 2");
      const fs = await import("fs");
      const { join } = await import("path");
      const { getPaths } = await import("../src/config/paths.js");
      const { dump } = await import("js-yaml");
      
      const serverDir = join(getPaths().root, "mcp-servers", id2);
      fs.mkdirSync(serverDir, { recursive: true });
      fs.writeFileSync(
        join(serverDir, "config.yaml"),
        dump({
          id: id2,
          name: "Same Name", // Same display name
          command: "node",
          args: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        "utf-8"
      );

      // Now check for duplicates - both have same name but different IDs
      const duplicate = await service.findDuplicateNames(["same-name", id2]);
      expect(duplicate).toBe("Same Name");
    });

    it("should return null when no duplicates", async () => {
      await service.create({
        name: "Unique One",
        command: "npx",
        args: [],
      });

      await service.create({
        name: "Unique Two",
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
        command: "npx",
        args: [],
      });

      await service.create({
        name: "Server B",
        command: "node",
        args: [],
      });

      const servers = await service.findAll();
      expect(servers).toHaveLength(2);
    });

    it("should find MCP server by ID", async () => {
      await service.create({
        name: "Findable",
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
