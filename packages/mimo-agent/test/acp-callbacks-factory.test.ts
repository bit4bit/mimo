import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { AcpClientCallbacks } from "../src/acp/client.js";

// Track WebSocket messages sent
const recordedMessages: Array<Record<string, unknown>> = [];
// Track lifecycleManager.recordActivity calls
const recordedActivities: Array<{ sessionId: string; chatThreadId: string }> = [];

// Mock jose before importing index.ts
mock.module("jose", () => ({
  decodeJwt: () => ({ sub: "test-user" }),
}));

// Mock the ACP SDK
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

    async newSession() {
      return {
        sessionId: "test-acp-session",
      };
    }

    async prompt() {
      return {};
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

// Mock provider for ACP client
const mockProvider = {
  name: "test-provider",
  spawn: () => ({
    process: { kill: () => {}, on: () => {} },
    input: new WritableStream<Uint8Array>(),
    output: new ReadableStream<Uint8Array>(),
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

describe("buildAcpCallbacks factory", () => {
  beforeEach(() => {
    recordedMessages.length = 0;
    recordedActivities.length = 0;
  });

  describe("emits correct WS messages", () => {
    it("emits thought_start with correct sessionId and chatThreadId", async () => {
      const { MimoAgent } = await import("../src/index.js");

      // Create mock dependencies
      const mockWs = {
        send: (data: string) => {
          recordedMessages.push(JSON.parse(data));
        },
        readyState: 1, // OPEN
      };

      const mockSessionManager = {
        getSession: () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
          acpProcess: null,
        }),
        setSessionAcpProcess: () => {},
        createSession: async () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
        }),
        setSessionState: () => {},
        setSessionMcpServers: () => {},
        setSessionAgentSubpath: () => {},
      };

      const mockLifecycleManager = {
        recordActivity: (sessionId: string, chatThreadId: string) => {
          recordedActivities.push({ sessionId, chatThreadId });
        },
        getThreadState: () => "active" as const,
        initializeThread: () => {},
        queueThreadPrompt: async () => {},
        onSpawnAcp: async () => {},
      };

      const deps = {
        os: {
          path: { join: (...parts: string[]) => parts.join("/") },
          fs: {
            exists: async () => false,
            mkdir: async () => {},
          },
          command: { run: async () => ({ success: true, output: "" }) },
          env: { getAll: () => ({}) },
        },
        config: {
          token: "test-token",
          platform: "ws://test",
          workDir: "/tmp/work",
          provider: "opencode" as const,
        },
        sessionManager: mockSessionManager as any,
        lifecycleManager: mockLifecycleManager as any,
        provider: mockProvider as any,
      };

      const agent = new MimoAgent(deps);
      // Access the private ws property for testing
      (agent as any).ws = mockWs;

      // Access the private buildAcpCallbacks method
      const buildAcpCallbacks = (agent as any).buildAcpCallbacks.bind(agent);
      const callbacks: AcpClientCallbacks = buildAcpCallbacks(
        "test-session",
        "test-thread",
      );

      // Trigger onThoughtStart
      callbacks.onThoughtStart("test-session");

      // Verify the message was sent with correct fields
      const thoughtStartMsg = recordedMessages.find(
        (m) => m.type === "thought_start",
      );
      expect(thoughtStartMsg).toBeDefined();
      expect(thoughtStartMsg?.sessionId).toBe("test-session");
      expect(thoughtStartMsg?.chatThreadId).toBe("test-thread");
      expect(thoughtStartMsg?.timestamp).toBeDefined();
    });

    it("emits message_chunk with correct sessionId, chatThreadId, and content", async () => {
      const { MimoAgent } = await import("../src/index.js");

      const mockWs = {
        send: (data: string) => {
          recordedMessages.push(JSON.parse(data));
        },
        readyState: 1,
      };

      const mockSessionManager = {
        getSession: () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
          acpProcess: null,
        }),
        setSessionAcpProcess: () => {},
        createSession: async () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
        }),
        setSessionState: () => {},
        setSessionMcpServers: () => {},
        setSessionAgentSubpath: () => {},
      };

      const mockLifecycleManager = {
        recordActivity: (sessionId: string, chatThreadId: string) => {
          recordedActivities.push({ sessionId, chatThreadId });
        },
        getThreadState: () => "active" as const,
        initializeThread: () => {},
        queueThreadPrompt: async () => {},
        onSpawnAcp: async () => {},
      };

      const deps = {
        os: {
          path: { join: (...parts: string[]) => parts.join("/") },
          fs: {
            exists: async () => false,
            mkdir: async () => {},
          },
          command: { run: async () => ({ success: true, output: "" }) },
          env: { getAll: () => ({}) },
        },
        config: {
          token: "test-token",
          platform: "ws://test",
          workDir: "/tmp/work",
          provider: "opencode" as const,
        },
        sessionManager: mockSessionManager as any,
        lifecycleManager: mockLifecycleManager as any,
        provider: mockProvider as any,
      };

      const agent = new MimoAgent(deps);
      (agent as any).ws = mockWs;

      const buildAcpCallbacks = (agent as any).buildAcpCallbacks.bind(agent);
      const callbacks: AcpClientCallbacks = buildAcpCallbacks(
        "test-session",
        "test-thread",
      );

      // Trigger onMessageChunk
      callbacks.onMessageChunk("test-session", "Hello, world!");

      const messageChunkMsg = recordedMessages.find(
        (m) => m.type === "message_chunk",
      );
      expect(messageChunkMsg).toBeDefined();
      expect(messageChunkMsg?.sessionId).toBe("test-session");
      expect(messageChunkMsg?.chatThreadId).toBe("test-thread");
      expect(messageChunkMsg?.content).toBe("Hello, world!");
      expect(messageChunkMsg?.timestamp).toBeDefined();
    });

    it("truncates toolInput to 200 chars with '...' suffix", async () => {
      const { MimoAgent } = await import("../src/index.js");

      const mockWs = {
        send: (data: string) => {
          recordedMessages.push(JSON.parse(data));
        },
        readyState: 1,
      };

      const mockSessionManager = {
        getSession: () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
          acpProcess: null,
        }),
        setSessionAcpProcess: () => {},
        createSession: async () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
        }),
        setSessionState: () => {},
        setSessionMcpServers: () => {},
        setSessionAgentSubpath: () => {},
      };

      const mockLifecycleManager = {
        recordActivity: () => {},
        getThreadState: () => "active" as const,
        initializeThread: () => {},
        queueThreadPrompt: async () => {},
        onSpawnAcp: async () => {},
      };

      const deps = {
        os: {
          path: { join: (...parts: string[]) => parts.join("/") },
          fs: {
            exists: async () => false,
            mkdir: async () => {},
          },
          command: { run: async () => ({ success: true, output: "" }) },
          env: { getAll: () => ({}) },
        },
        config: {
          token: "test-token",
          platform: "ws://test",
          workDir: "/tmp/work",
          provider: "opencode" as const,
        },
        sessionManager: mockSessionManager as any,
        lifecycleManager: mockLifecycleManager as any,
        provider: mockProvider as any,
      };

      const agent = new MimoAgent(deps);
      (agent as any).ws = mockWs;

      const buildAcpCallbacks = (agent as any).buildAcpCallbacks.bind(agent);
      const callbacks: AcpClientCallbacks = buildAcpCallbacks(
        "test-session",
        "test-thread",
      );

      // Create a large input (> 200 chars)
      const largeInput = {
        code: "x".repeat(300),
        filename: "test.txt",
      };

      callbacks.onToolCall("test-session", {
        toolCallId: "tool-1",
        title: "Test Tool",
        kind: "test",
        rawInput: largeInput,
        status: "pending",
      });

      const toolCallMsg = recordedMessages.find((m) => m.type === "tool_call");
      expect(toolCallMsg).toBeDefined();
      expect(toolCallMsg?.toolInput).toBeDefined();
      const toolInput = toolCallMsg?.toolInput as string;
      expect(toolInput.length).toBe(203); // 200 + "..."
      expect(toolInput.endsWith("...")).toBe(true);
    });
  });

  describe("records activity on all spawn paths", () => {
    it("calls recordActivity on thought_chunk via spawnAcpProcess path", async () => {
      const { MimoAgent } = await import("../src/index.js");

      const mockWs = {
        send: () => {},
        readyState: 1,
      };

      const mockSessionManager = {
        getSession: () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
          acpProcess: null,
        }),
        setSessionAcpProcess: () => {},
        createSession: async () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
        }),
        setSessionState: () => {},
        setSessionMcpServers: () => {},
        setSessionAgentSubpath: () => {},
      };

      const mockLifecycleManager = {
        recordActivity: (sessionId: string, chatThreadId: string) => {
          recordedActivities.push({ sessionId, chatThreadId });
        },
        getThreadState: () => "active" as const,
        initializeThread: () => {},
        queueThreadPrompt: async () => {},
        onSpawnAcp: async () => {},
      };

      const deps = {
        os: {
          path: { join: (...parts: string[]) => parts.join("/") },
          fs: {
            exists: async () => false,
            mkdir: async () => {},
          },
          command: { run: async () => ({ success: true, output: "" }) },
          env: { getAll: () => ({}) },
        },
        config: {
          token: "test-token",
          platform: "ws://test",
          workDir: "/tmp/work",
          provider: "opencode" as const,
        },
        sessionManager: mockSessionManager as any,
        lifecycleManager: mockLifecycleManager as any,
        provider: mockProvider as any,
      };

      const agent = new MimoAgent(deps);
      (agent as any).ws = mockWs;

      const buildAcpCallbacks = (agent as any).buildAcpCallbacks.bind(agent);
      const callbacks: AcpClientCallbacks = buildAcpCallbacks(
        "test-session",
        "test-thread",
      );

      // Trigger onThoughtChunk (simulating spawnAcpProcess path)
      callbacks.onThoughtChunk("test-session", "thinking...");

      // Verify recordActivity was called
      expect(recordedActivities.length).toBe(1);
      expect(recordedActivities[0].sessionId).toBe("test-session");
      expect(recordedActivities[0].chatThreadId).toBe("test-thread");
    });

    it("calls recordActivity on message_chunk via respawnAcpProcess path", async () => {
      const { MimoAgent } = await import("../src/index.js");

      const mockWs = {
        send: () => {},
        readyState: 1,
      };

      const mockSessionManager = {
        getSession: () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
          acpProcess: null,
        }),
        setSessionAcpProcess: () => {},
        createSession: async () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
        }),
        setSessionState: () => {},
        setSessionMcpServers: () => {},
        setSessionAgentSubpath: () => {},
      };

      const mockLifecycleManager = {
        recordActivity: (sessionId: string, chatThreadId: string) => {
          recordedActivities.push({ sessionId, chatThreadId });
        },
        getThreadState: () => "active" as const,
        initializeThread: () => {},
        queueThreadPrompt: async () => {},
        onSpawnAcp: async () => {},
      };

      const deps = {
        os: {
          path: { join: (...parts: string[]) => parts.join("/") },
          fs: {
            exists: async () => false,
            mkdir: async () => {},
          },
          command: { run: async () => ({ success: true, output: "" }) },
          env: { getAll: () => ({}) },
        },
        config: {
          token: "test-token",
          platform: "ws://test",
          workDir: "/tmp/work",
          provider: "opencode" as const,
        },
        sessionManager: mockSessionManager as any,
        lifecycleManager: mockLifecycleManager as any,
        provider: mockProvider as any,
      };

      const agent = new MimoAgent(deps);
      (agent as any).ws = mockWs;

      const buildAcpCallbacks = (agent as any).buildAcpCallbacks.bind(agent);
      const callbacks: AcpClientCallbacks = buildAcpCallbacks(
        "test-session",
        "test-thread",
      );

      // Trigger onMessageChunk (simulating respawnAcpProcess path)
      callbacks.onMessageChunk("test-session", "Hello!");

      // Verify recordActivity was called
      expect(recordedActivities.length).toBe(1);
      expect(recordedActivities[0].sessionId).toBe("test-session");
      expect(recordedActivities[0].chatThreadId).toBe("test-thread");
    });

    it("calls recordActivity on tool_call via spawnAcpProcess path", async () => {
      const { MimoAgent } = await import("../src/index.js");

      const mockWs = {
        send: () => {},
        readyState: 1,
      };

      const mockSessionManager = {
        getSession: () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
          acpProcess: null,
        }),
        setSessionAcpProcess: () => {},
        createSession: async () => ({
          sessionId: "test-session",
          checkoutPath: "/tmp/test",
        }),
        setSessionState: () => {},
        setSessionMcpServers: () => {},
        setSessionAgentSubpath: () => {},
      };

      const mockLifecycleManager = {
        recordActivity: (sessionId: string, chatThreadId: string) => {
          recordedActivities.push({ sessionId, chatThreadId });
        },
        getThreadState: () => "active" as const,
        initializeThread: () => {},
        queueThreadPrompt: async () => {},
        onSpawnAcp: async () => {},
      };

      const deps = {
        os: {
          path: { join: (...parts: string[]) => parts.join("/") },
          fs: {
            exists: async () => false,
            mkdir: async () => {},
          },
          command: { run: async () => ({ success: true, output: "" }) },
          env: { getAll: () => ({}) },
        },
        config: {
          token: "test-token",
          platform: "ws://test",
          workDir: "/tmp/work",
          provider: "opencode" as const,
        },
        sessionManager: mockSessionManager as any,
        lifecycleManager: mockLifecycleManager as any,
        provider: mockProvider as any,
      };

      const agent = new MimoAgent(deps);
      (agent as any).ws = mockWs;

      const buildAcpCallbacks = (agent as any).buildAcpCallbacks.bind(agent);
      const callbacks: AcpClientCallbacks = buildAcpCallbacks(
        "test-session",
        "test-thread",
      );

      // Trigger onToolCall (simulating spawnAcpProcess path)
      callbacks.onToolCall("test-session", {
        toolCallId: "tool-1",
        title: "Test Tool",
        kind: "test",
        rawInput: { query: "test" },
        status: "pending",
      });

      // Verify recordActivity was called
      expect(recordedActivities.length).toBe(1);
      expect(recordedActivities[0].sessionId).toBe("test-session");
      expect(recordedActivities[0].chatThreadId).toBe("test-thread");
    });
  });
});
