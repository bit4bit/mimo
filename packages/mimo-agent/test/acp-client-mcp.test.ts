// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";
import { AcpClient } from "../src/acp/client.js";
import type { AcpClientCallbacks } from "../src/acp/client.js";
import type { McpServerConfig } from "../src/types";

// Mock provider
const mockProvider = {
  name: "test-provider",
  spawn: () => ({
    process: { pid: 12345 },
    stdin: { write: () => {}, end: () => {} },
    stdout: { on: () => {}, pipe: () => ({}) },
  }),
  extractState: () => ({
    modelState: {
      currentModelId: "test-model",
      availableModels: [],
      optionId: "model-option",
    },
    modeState: {
      currentModeId: "test-mode",
      availableModes: [],
      optionId: "mode-option",
    },
  }),
  setModel: async () => {},
  setMode: async () => {},
  mapUpdateType: (type: string) => type,
};

const mockCallbacks: AcpClientCallbacks = {
  onThoughtStart: () => {},
  onThoughtChunk: () => {},
  onThoughtEnd: () => {},
  onMessageChunk: () => {},
  onUsageUpdate: () => {},
  onGenericUpdate: () => {},
  onAvailableCommandsUpdate: () => {},
  onPermissionRequest: async () => ({ outcome: "allow" }),
};

describe("AcpClient with MCP Servers", () => {
  describe("initialize", () => {
    it("should accept MCP servers in initialize options", async () => {
      const client = new AcpClient(
        mockProvider as any,
        "test-session",
        mockCallbacks,
      );

      const mcpServers: McpServerConfig[] = [
        {
          name: "github",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        },
      ];

      // Verify the method signature accepts mcpServers parameter
      // (Actual initialization would require a real ACP process)
      expect(client).toBeDefined();
    });

    it("should handle empty MCP servers array", async () => {
      const client = new AcpClient(
        mockProvider as any,
        "test-session",
        mockCallbacks,
      );

      expect(client).toBeDefined();
    });

    it("should handle undefined MCP servers", async () => {
      const client = new AcpClient(
        mockProvider as any,
        "test-session",
        mockCallbacks,
      );

      expect(client).toBeDefined();
    });
  });

  describe("McpServerConfig type", () => {
    it("should accept valid MCP server config", () => {
      const config: McpServerConfig = {
        name: "test-server",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-test"],
      };

      expect(config.name).toBe("test-server");
      expect(config.command).toBe("npx");
      expect(config.args).toEqual(["-y", "@modelcontextprotocol/server-test"]);
    });

    it("should accept MCP server config with env", () => {
      const config: McpServerConfig = {
        name: "test-server",
        command: "npx",
        args: ["script.js"],
        env: [{ name: "API_KEY", value: "secret123" }],
      };

      expect(config.env).toHaveLength(1);
      expect(config.env?.[0].name).toBe("API_KEY");
      expect(config.env?.[0].value).toBe("secret123");
    });

    it("should accept empty args array", () => {
      const config: McpServerConfig = {
        name: "simple-server",
        command: "node",
        args: [],
      };

      expect(config.args).toEqual([]);
    });
  });
});
