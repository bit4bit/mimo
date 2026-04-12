import { describe, it, expect } from "bun:test";
import { ClaudeAgentProvider } from "../src/acp/providers/claude-agent";
import { OpencodeProvider } from "../src/acp/providers/opencode";
import { NewSessionResponse } from "../src/acp/types";

const AGENT_CWD = import.meta.dir.replace("/test", "");

describe("provider selection", () => {
  describe("--provider flag: unknown value exits with code 1", () => {
    it("should exit with code 1 for an unrecognized provider", async () => {
      const proc = Bun.spawn(
        [
          process.execPath, "run", "src/index.ts",
          "--token", "test-token",
          "--platform", "ws://localhost:3000/ws/agent",
          "--provider", "invalid-provider",
        ],
        {
          cwd: AGENT_CWD,
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);
    });

    it("should include provider name in error output", async () => {
      const proc = Bun.spawn(
        [
          process.execPath, "run", "src/index.ts",
          "--token", "test-token",
          "--platform", "ws://localhost:3000/ws/agent",
          "--provider", "unknown-xyz",
        ],
        {
          cwd: AGENT_CWD,
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      await proc.exited;
      const stderr = await new Response(proc.stderr).text();
      expect(stderr).toContain("unknown-xyz");
    });
  });

  describe("--provider opencode (default behavior)", () => {
    it("should log startup message when --provider opencode is passed", async () => {
      const proc = Bun.spawn(
        [
          process.execPath, "run", "src/index.ts",
          "--token", "test-token",
          "--platform", "ws://localhost:9999/ws/agent",
          "--provider", "opencode",
        ],
        {
          cwd: AGENT_CWD,
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      // Agent logs "[mimo-agent] Starting..." before attempting connection
      expect(stdout).toContain("[mimo-agent] Starting...");
    });

    it("should log startup message when --provider is omitted (default opencode)", async () => {
      const proc = Bun.spawn(
        [
          process.execPath, "run", "src/index.ts",
          "--token", "test-token",
          "--platform", "ws://localhost:9999/ws/agent",
        ],
        {
          cwd: AGENT_CWD,
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      expect(stdout).toContain("[mimo-agent] Starting...");
    });
  });

  describe("--provider claude: starts without provider error", () => {
    it("should log startup message when --provider claude is passed", async () => {
      const proc = Bun.spawn(
        [
          process.execPath, "run", "src/index.ts",
          "--token", "test-token",
          "--platform", "ws://localhost:9999/ws/agent",
          "--provider", "claude",
        ],
        {
          cwd: AGENT_CWD,
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      // Agent logs "[mimo-agent] Starting..." before attempting connection — confirms provider was valid
      expect(stdout).toContain("[mimo-agent] Starting...");
    });
  });

  describe("--provider codex: starts without provider error", () => {
    it("should log startup message when --provider codex is passed", async () => {
      const proc = Bun.spawn(
        [
          process.execPath, "run", "src/index.ts",
          "--token", "test-token",
          "--platform", "ws://localhost:9999/ws/agent",
          "--provider", "codex",
        ],
        {
          cwd: AGENT_CWD,
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      expect(stdout).toContain("[mimo-agent] Starting...");
    });
  });
});

describe("ClaudeAgentProvider", () => {
  const provider = new ClaudeAgentProvider();

  describe("provider metadata", () => {
    it("should have correct provider name", () => {
      expect(provider.name).toBe("claude");
    });
  });

  describe("mapUpdateType", () => {
    it("should map agent_thought_chunk to thought_chunk", () => {
      expect(provider.mapUpdateType("agent_thought_chunk")).toBe("thought_chunk");
    });

    it("should map agent_message_chunk to message_chunk", () => {
      expect(provider.mapUpdateType("agent_message_chunk")).toBe("message_chunk");
    });

    it("should map usage_update to usage_update", () => {
      expect(provider.mapUpdateType("usage_update")).toBe("usage_update");
    });

    it("should return null for tool_call_update (skip)", () => {
      expect(provider.mapUpdateType("tool_call_update")).toBeNull();
    });

    it("should return null for config_option_update (skip)", () => {
      expect(provider.mapUpdateType("config_option_update")).toBeNull();
    });

    it("should return null for unknown update types", () => {
      expect(provider.mapUpdateType("some_unknown_type")).toBeNull();
    });
  });

  describe("extractState", () => {
    it("should extract model and mode state from configOptions", () => {
      const response: NewSessionResponse = {
        sessionId: "test-session",
        configOptions: [
          {
            id: "model",
            category: "model",
            type: "select",
            options: [
              { value: "claude-opus-4-6", name: "Claude Opus", description: "Most capable" },
              { value: "claude-sonnet-4-6", name: "Claude Sonnet", description: "Balanced" },
            ],
            currentValue: "claude-sonnet-4-6",
          },
          {
            id: "mode",
            category: "mode",
            type: "select",
            options: [
              { value: "default", name: "Default", description: "Default mode" },
            ],
            currentValue: "default",
          },
        ],
      };

      const state = provider.extractState(response);

      expect(state.modelState).toBeDefined();
      expect(state.modelState?.currentModelId).toBe("claude-sonnet-4-6");
      expect(state.modelState?.availableModels).toHaveLength(2);
      expect(state.modelState?.optionId).toBe("model");

      expect(state.modeState).toBeDefined();
      expect(state.modeState?.currentModeId).toBe("default");
      expect(state.modeState?.optionId).toBe("mode");
    });

    it("should return empty state when no configOptions", () => {
      const response: NewSessionResponse = { sessionId: "test-session" };
      const state = provider.extractState(response);
      expect(state.modelState).toBeUndefined();
      expect(state.modeState).toBeUndefined();
    });

    it("should fallback to first available model when no current value set", () => {
      const response: NewSessionResponse = {
        sessionId: "test-session",
        configOptions: [
          {
            id: "model",
            category: "model",
            type: "select",
            options: [{ value: "claude-haiku-4-5", name: "Claude Haiku" }],
          },
        ],
      };

      const state = provider.extractState(response);
      expect(state.modelState?.currentModelId).toBe("claude-haiku-4-5");
    });
  });
});
