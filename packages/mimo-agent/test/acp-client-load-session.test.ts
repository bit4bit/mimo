import { describe, it, expect, mock } from "bun:test";

const extMethodCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
const recordedLoadSessionParams: Array<Record<string, unknown>> = [];

mock.module("@agentclientprotocol/sdk", () => {
  class ClientSideConnection {
    closed = Promise.resolve();
    constructor(_factory: unknown, _stream: unknown) {}

    async initialize() {
      return {
        protocolVersion: "1.0",
        agentCapabilities: { loadSession: true },
      };
    }

    async loadSession(params: Record<string, unknown>) {
      recordedLoadSessionParams.push(params);
      return {
        configOptions: [
          {
            id: "model",
            category: "model",
            type: "select",
            options: [{ value: "gpt-4", name: "GPT-4" }],
            currentValue: "gpt-4",
          },
          {
            id: "mode",
            category: "mode",
            type: "select",
            options: [{ value: "build", name: "Build" }],
            currentValue: "build",
          },
        ],
      };
    }

    async newSession(params: Record<string, unknown>) {
      return { sessionId: "new-session", ...params };
    }

    async extMethod(method: string, params: Record<string, unknown>) {
      extMethodCalls.push({ method, params });
      return {};
    }

    async prompt(params: Record<string, unknown>) {
      extMethodCalls.push({ method: "session/prompt", params });
      return {};
    }

    async cancel() {
      return;
    }
  }

  class AgentSideConnection {
    closed = Promise.resolve();
    get signal() {
      return new AbortController().signal;
    }
    constructor(_factory: unknown, _stream: unknown) {}
  }

  return {
    PROTOCOL_VERSION: "1.0",
    ndJsonStream: () => ({}) as any,
    ClientSideConnection,
    AgentSideConnection,
  };
});

const mockProvider = {
  name: "test-provider",
  spawn: () => ({
    process: { kill: () => {}, on: () => {} },
    input: new WritableStream<Uint8Array>(),
    output: new ReadableStream<Uint8Array>(),
  }),
  extractState: () => ({
    modelState: { currentModelId: "gpt-4", availableModels: [], optionId: "model" },
    modeState: { currentModeId: "build", availableModes: [], optionId: "mode" },
  }),
  setModel: async (_connection: any, acpSessionId: string, modelId: string, _optionId: string) => {
    await _connection.extMethod("session/set_model", { sessionId: acpSessionId, modelId });
  },
  setMode: async (_connection: any, acpSessionId: string, modeId: string, _optionId: string) => {
    await _connection.extMethod("session/set_mode", { sessionId: acpSessionId, modeId });
  },
  mapUpdateType: () => null,
};

const mockCallbacks: any = {
  onThoughtStart: () => {},
  onThoughtChunk: () => {},
  onThoughtEnd: () => {},
  onMessageChunk: () => {},
  onUsageUpdate: () => {},
  onGenericUpdate: () => {},
  onAvailableCommandsUpdate: () => {},
  onPromptCompleted: () => {},
  onPermissionRequest: async () => ({ outcome: "allow" }),
};

describe("AcpClient loadSession preserves acpSessionId", () => {
  it("uses existingSessionId after loadSession (LoadSessionResponse has no sessionId field)", async () => {
    recordedLoadSessionParams.length = 0;

    const { AcpClient } = await import("../src/acp/client.js");
    const client = new AcpClient(
      mockProvider as any,
      "test-session",
      mockCallbacks,
    );

    const existingSessionId = "existing-session-123";
    await client.initialize(
      "/tmp/repo",
      new WritableStream<Uint8Array>(),
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
      existingSessionId,
      [],
    );

    expect(await client.getAcpSessionId()).toBe(existingSessionId);
    expect(recordedLoadSessionParams).toHaveLength(1);
    expect(recordedLoadSessionParams[0]).toEqual({
      sessionId: existingSessionId,
      cwd: "/tmp/repo",
      mcpServers: [],
    });
  });

  it("subsequent setModel/setMode/prompt calls use the correct sessionId", async () => {
    extMethodCalls.length = 0;

    const { AcpClient } = await import("../src/acp/client.js");
    const client = new AcpClient(
      mockProvider as any,
      "test-session",
      mockCallbacks,
    );

    const existingSessionId = "existing-session-123";
    await client.initialize(
      "/tmp/repo",
      new WritableStream<Uint8Array>(),
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
      existingSessionId,
      [],
    );

    await client.setModel("gpt-4");
    await client.setMode("build");
    await client.prompt("Hello world");

    expect(extMethodCalls).toHaveLength(3);

    expect(extMethodCalls[0]).toEqual({
      method: "session/set_model",
      params: { sessionId: existingSessionId, modelId: "gpt-4" },
    });

    expect(extMethodCalls[1]).toEqual({
      method: "session/set_mode",
      params: { sessionId: existingSessionId, modeId: "build" },
    });

    expect(extMethodCalls[2]).toEqual({
      method: "session/prompt",
      params: {
        sessionId: existingSessionId,
        prompt: [{ type: "text", text: "Hello world" }],
      },
    });
  });
});
