import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { AcpClientCallbacks } from "../src/acp/client.js";

const recordedNewSessionParams: Array<Record<string, unknown>> = [];

mock.module("@agentclientprotocol/sdk", () => {
  class ClientSideConnection {
    closed = Promise.resolve();

    constructor(_factory: unknown, _stream: unknown) {}

    async initialize() {
      return {
        protocolVersion: "1.0",
        agentCapabilities: {
          loadSession: true,
        },
      };
    }

    async loadSession(params: Record<string, unknown>) {
      recordedNewSessionParams.push(params);
      return {
        sessionId: "loaded-session",
      };
    }

    async newSession(params: Record<string, unknown>) {
      recordedNewSessionParams.push(params);
      return {
        sessionId: "new-session",
      };
    }

    async prompt() {
      return {};
    }

    async cancel() {
      return;
    }
  }

  return {
    PROTOCOL_VERSION: "1.0",
    ndJsonStream: () => ({}) as any,
    ClientSideConnection,
  };
});

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
  mapUpdateType: () => null,
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

describe("AcpClient clear() cwd behavior", () => {
  beforeEach(() => {
    recordedNewSessionParams.length = 0;
  });

  it("persists initialize cwd and reuses it during clear", async () => {
    const { AcpClient } = await import("../src/acp/client.js");
    const client = new AcpClient(
      mockProvider as any,
      "test-session",
      mockCallbacks,
    );

    const cwd = "/tmp/repo/packages/api";
    await client.initialize(
      cwd,
      new WritableStream<Uint8Array>(),
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
      undefined,
      [],
    );

    expect((client as any).session.checkoutPath).toBe(cwd);

    await client.clear();

    const clearCall = recordedNewSessionParams.at(-1);
    expect(clearCall?.cwd).toBe(cwd);
  });

  it("throws clear error when checkout path is missing", async () => {
    const { AcpClient } = await import("../src/acp/client.js");
    const client = new AcpClient(
      mockProvider as any,
      "test-session",
      mockCallbacks,
    );

    (client as any).session = {
      sessionId: "test-session",
      acpSessionId: "old-session",
      connection: {
        newSession: async () => ({ sessionId: "new-session" }),
      },
      stdin: new WritableStream<Uint8Array>(),
      mcpServers: [],
    };

    await expect(client.clear()).rejects.toThrow("Missing checkoutPath");
  });
});
