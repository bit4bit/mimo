/**
 * Regression test: error_response must serialize Error instances to strings.
 *
 * Bug: when ACP SDK throws a RequestError, the catch handler sent `error: err`
 * directly. Error instances have no enumerable properties, so JSON.stringify
 * produced `{}` which the platform displayed as `[object Object]`.
 */
import { describe, it, expect, mock } from "bun:test";

mock.module("jose", () => ({
  decodeJwt: () => ({ sub: "test-user" }),
}));

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
    async newSession() {
      return { sessionId: "test-acp-session" };
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

describe("error_response serialization", () => {
  async function buildAgent(overrides: { promptThrows?: any } = {}) {
    const { MimoAgent } = await import("../src/index.js");

    const sentMessages: any[] = [];

    const mockProvider = {
      name: "test",
      spawn: () => ({
        process: {
          kill: () => {},
          on: () => {},
          killed: false,
          stderr: { on: () => {} },
        },
        input: new WritableStream<Uint8Array>(),
        output: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
      }),
      extractState: () => ({
        modelState: {
          currentModelId: "m",
          availableModels: [],
          optionId: "mo",
        },
        modeState: { currentModeId: "md", availableModes: [], optionId: "mdo" },
      }),
      setModel: async () => {},
      setMode: async () => {},
      mapUpdateType: () => null,
    };

    const deps = {
      os: {
        path: {
          join: (...parts: string[]) => parts.join("/"),
          homeDir: () => "/tmp",
        },
        fs: {
          exists: async () => false,
          mkdir: async () => {},
          readFile: async () => "",
          writeFile: async () => {},
          unlink: async () => {},
          copyFile: async () => {},
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
      sessionManager: {
        getSession: () => ({
          sessionId: "s1",
          checkoutPath: "/tmp/s1",
          acpProcess: null,
          mcpServers: [],
          agentSubpath: undefined,
          modelState: undefined,
          modeState: undefined,
        }),
        setSessionAcpProcess: () => {},
        createSession: async () => ({
          sessionId: "s1",
          checkoutPath: "/tmp/s1",
        }),
        setSessionState: () => {},
        setSessionMcpServers: () => {},
        setSessionAgentSubpath: () => {},
      } as any,
      lifecycleManager: {
        getThreadState: () => "active",
        setThreadState: () => {},
        initializeThread: () => {},
        recordActivity: () => {},
        queueThreadPrompt: async () => {},
        endThread: () => {},
        endSession: () => {},
        drainQueue: async () => {},
      } as any,
      provider: mockProvider as any,
    };

    const agent = new MimoAgent(deps);
    (agent as any).ws = {
      send: (msg: string) => sentMessages.push(JSON.parse(msg)),
      readyState: 1,
    };

    // Inject a fake ACP client that throws on prompt
    const fakeAcpClient = {
      prompt: async () => {
        throw overrides.promptThrows ?? new Error("Simulated prompt failure");
      },
      sessionId: "test-acp-session",
    };
    (agent as any).acpClients = new Map([["s1:t1", fakeAcpClient]]);

    return { agent, sentMessages };
  }

  it("serializes plain Error to string in error_response", async () => {
    const { agent, sentMessages } = await buildAgent({
      promptThrows: new Error("Rate limit hit"),
    });

    await (agent as any).sendPrompt(
      (agent as any).acpClients.get("s1:t1"),
      "s1",
      "t1",
      "hello",
    );

    const errorResp = sentMessages.find((m) => m.type === "error_response");
    expect(errorResp).toBeDefined();
    expect(typeof errorResp.error).toBe("string");
    expect(errorResp.error).toBe("Rate limit hit");
  });

  it("serializes RequestError-like object to string in error_response", async () => {
    // Simulate ACP SDK RequestError which has code/message/data but .message
    // is not enumerable so JSON.stringify produces `{}`
    class RequestError extends Error {
      code: number;
      data?: any;
      constructor(code: number, message: string, data?: any) {
        super(message);
        this.code = code;
        this.data = data;
      }
    }

    const { agent, sentMessages } = await buildAgent({
      promptThrows: new RequestError(
        -32603,
        "You've hit your limit",
        undefined,
      ),
    });

    await (agent as any).sendPrompt(
      (agent as any).acpClients.get("s1:t1"),
      "s1",
      "t1",
      "hello",
    );

    const errorResp = sentMessages.find((m) => m.type === "error_response");
    expect(errorResp).toBeDefined();
    expect(typeof errorResp.error).toBe("string");
    expect(errorResp.error).toContain("You've hit your limit");
  });

  it("serializes non-Error values to string in error_response", async () => {
    const { agent, sentMessages } = await buildAgent({
      promptThrows: "raw string error",
    });

    await (agent as any).sendPrompt(
      (agent as any).acpClients.get("s1:t1"),
      "s1",
      "t1",
      "hello",
    );

    const errorResp = sentMessages.find((m) => m.type === "error_response");
    expect(errorResp).toBeDefined();
    expect(typeof errorResp.error).toBe("string");
    expect(errorResp.error).toBe("raw string error");
  });
});
