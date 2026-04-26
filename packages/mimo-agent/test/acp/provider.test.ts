import { describe, it, expect, mock } from "bun:test";
import { OpencodeProvider } from "../../src/acp/providers/opencode";
import { ClaudeAgentProvider } from "../../src/acp/providers/claude-agent";
import { NewSessionResponse } from "../../src/acp/types";
import { Writable, Readable } from "node:stream";

describe("OpencodeProvider", () => {
  const provider = new OpencodeProvider();

  describe("mapUpdateType", () => {
    it("should map agent_thought_chunk to thought_chunk", () => {
      const result = provider.mapUpdateType("agent_thought_chunk");
      expect(result).toBe("thought_chunk");
    });

    it("should map agent_message_chunk to message_chunk", () => {
      const result = provider.mapUpdateType("agent_message_chunk");
      expect(result).toBe("message_chunk");
    });

    it("should map usage_update to usage_update", () => {
      const result = provider.mapUpdateType("usage_update");
      expect(result).toBe("usage_update");
    });

    it("should map available_commands_update to available_commands_update", () => {
      const result = provider.mapUpdateType("available_commands_update");
      expect(result).toBe("available_commands_update");
    });

    it("should return null for unknown update types", () => {
      const result = provider.mapUpdateType("unknown_update_type");
      expect(result).toBeNull();
    });

    it("should return null for arbitrary update names", () => {
      const result = provider.mapUpdateType("some_random_update");
      expect(result).toBeNull();
    });
  });

  describe("extractState", () => {
    it("should extract model state from legacy format", () => {
      const response: NewSessionResponse = {
        sessionId: "test-session",
        models: {
          currentModelId: "model-1",
          availableModels: [
            {
              modelId: "model-1",
              name: "Model 1",
              description: "Test model 1",
            },
            {
              modelId: "model-2",
              name: "Model 2",
              description: "Test model 2",
            },
          ],
        },
        modes: {
          currentModeId: "build",
          availableModes: [
            { id: "build", name: "Build", description: "Build mode" },
            { id: "plan", name: "Plan", description: "Plan mode" },
          ],
        },
      };

      const state = provider.extractState(response);

      expect(state.modelState).toBeDefined();
      expect(state.modelState?.currentModelId).toBe("model-1");
      expect(state.modelState?.availableModels).toHaveLength(2);
      expect(state.modelState?.optionId).toBe("model");

      expect(state.modeState).toBeDefined();
      expect(state.modeState?.currentModeId).toBe("build");
      expect(state.modeState?.availableModes).toHaveLength(2);
      expect(state.modeState?.optionId).toBe("mode");
    });

    it("should extract state from modern configOptions format", () => {
      const response: NewSessionResponse = {
        sessionId: "test-session",
        configOptions: [
          {
            id: "model-select",
            category: "model",
            type: "select",
            options: [
              { value: "gpt-4", name: "GPT-4", description: "GPT-4 model" },
              { value: "claude", name: "Claude", description: "Claude model" },
            ],
            currentValue: "gpt-4",
          },
          {
            id: "mode-select",
            category: "mode",
            type: "select",
            options: [
              { value: "build", name: "Build", description: "Build mode" },
            ],
            currentValue: "build",
          },
        ],
      };

      const state = provider.extractState(response);

      expect(state.modelState).toBeDefined();
      expect(state.modelState?.currentModelId).toBe("gpt-4");
      expect(state.modelState?.availableModels).toHaveLength(2);
      expect(state.modelState?.optionId).toBe("model-select");

      expect(state.modeState).toBeDefined();
      expect(state.modeState?.currentModeId).toBe("build");
      expect(state.modeState?.optionId).toBe("mode-select");
    });

    it("should handle missing models/modes gracefully", () => {
      const response: NewSessionResponse = {
        sessionId: "test-session",
      };

      const state = provider.extractState(response);

      expect(state.modelState).toBeUndefined();
      expect(state.modeState).toBeUndefined();
    });

    it("should fallback to first available option when no current value", () => {
      const response: NewSessionResponse = {
        sessionId: "test-session",
        models: {
          availableModels: [{ modelId: "model-a", name: "Model A" }],
        },
      };

      const state = provider.extractState(response);

      expect(state.modelState?.currentModelId).toBe("model-a");
    });
  });

  describe("provider metadata", () => {
    it("should have correct provider name", () => {
      expect(provider.name).toBe("opencode");
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

    it("should return null for unknown update types", () => {
      expect(provider.mapUpdateType("unknown_type")).toBeNull();
    });
  });

  describe("spawn", () => {
    it("should spawn claude-agent-acp with provided cwd", () => {
      const mockProcess = {
        stdin: new Writable(),
        stdout: new Readable({ read() {} }),
        stderr: new Readable({ read() {} }),
        kill: () => {},
        on: () => {},
      };
      const mockSpawn = mock(() => mockProcess);
      const claudeProvider = new ClaudeAgentProvider(mockSpawn as any);

      const result = claudeProvider.spawn("/tmp");

      expect(result.input).toBeInstanceOf(WritableStream);
      expect(result.output).toBeInstanceOf(ReadableStream);
      expect(typeof result.process.kill).toBe("function");
      expect(typeof result.process.on).toBe("function");

      expect(mockSpawn).toHaveBeenCalled();
      const [command, args, options] = mockSpawn.mock.calls[0];
      expect(typeof command).toBe("string");
      expect(command.length).toBeGreaterThan(0);
      expect(args).toEqual([]);
      expect(options).toEqual({
        cwd: "/tmp",
        stdio: ["pipe", "pipe", "pipe"],
      });
    });

  });
});
