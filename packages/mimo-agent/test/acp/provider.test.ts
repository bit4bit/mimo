import { describe, it, expect } from "bun:test";
import { OpencodeProvider } from "../../src/acp/providers/opencode";
import { CodexProvider } from "../../src/acp/providers/codex";
import { NewSessionResponse } from "../../src/acp/types";

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

    it("should return null for available_commands_update (skip)", () => {
      const result = provider.mapUpdateType("available_commands_update");
      expect(result).toBeNull();
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
            { modelId: "model-1", name: "Model 1", description: "Test model 1" },
            { modelId: "model-2", name: "Model 2", description: "Test model 2" },
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
          availableModels: [
            { modelId: "model-a", name: "Model A" },
          ],
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
describe("CodexProvider", () => {
  const provider = new CodexProvider();

  describe("provider metadata", () => {
    it("should have correct provider name", () => {
      expect(provider.name).toBe("codex");
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

    it("should skip plan_update (returns null)", () => {
      expect(provider.mapUpdateType("plan_update")).toBeNull();
    });

    it("should skip tool_call_update (returns null)", () => {
      expect(provider.mapUpdateType("tool_call_update")).toBeNull();
    });

    it("should skip config_option_update (returns null)", () => {
      expect(provider.mapUpdateType("config_option_update")).toBeNull();
    });

    it("should skip available_commands_update (returns null)", () => {
      expect(provider.mapUpdateType("available_commands_update")).toBeNull();
    });

    it("should return null for unknown update types", () => {
      expect(provider.mapUpdateType("some_random_update")).toBeNull();
    });
  });

  describe("extractState", () => {
    it("should extract model and mode state from configOptions", () => {
      const response: NewSessionResponse = {
        sessionId: "test-session",
        configOptions: [
          {
            id: "model-select",
            category: "model",
            type: "select",
            options: [
              { value: "codex-pro", name: "Codex Pro" },
              { value: "codex-lite", name: "Codex Lite" },
            ],
            currentValue: "codex-pro",
          },
          {
            id: "mode-select",
            category: "mode",
            type: "select",
            options: [
              { value: "default", name: "Default" },
            ],
            currentValue: "default",
          },
        ],
      };

      const state = provider.extractState(response);

      expect(state.modelState?.currentModelId).toBe("codex-pro");
      expect(state.modelState?.optionId).toBe("model-select");
      expect(state.modelState?.availableModels).toHaveLength(2);

      expect(state.modeState?.currentModeId).toBe("default");
      expect(state.modeState?.optionId).toBe("mode-select");
    });

    it("should fallback to legacy fields when configOptions missing", () => {
      const response: NewSessionResponse = {
        sessionId: "test-session",
        models: {
          currentModelId: "legacy-model",
          availableModels: [
            { modelId: "legacy-model", name: "Legacy Model" },
          ],
        },
        modes: {
          currentModeId: "legacy-mode",
          availableModes: [
            { id: "legacy-mode", name: "Legacy Mode" },
          ],
        },
      };

      const state = provider.extractState(response);

      expect(state.modelState?.currentModelId).toBe("legacy-model");
      expect(state.modelState?.availableModels).toHaveLength(1);
      expect(state.modelState?.optionId).toBe("model");

      expect(state.modeState?.currentModeId).toBe("legacy-mode");
      expect(state.modeState?.availableModes).toHaveLength(1);
      expect(state.modeState?.optionId).toBe("mode");
    });
  });

  describe("setModel / setMode", () => {
    it("should call setSessionConfigOption for model updates", async () => {
      const calls: Array<Record<string, any>> = [];
      const connection = {
        setSessionConfigOption: async (payload: any) => {
          calls.push(payload);
        },
      };

      await provider.setModel(connection as any, "session-123", "codex-pro", "model-select");

      expect(calls).toEqual([
        {
          sessionId: "session-123",
          configId: "model-select",
          value: "codex-pro",
        },
      ]);
    });

    it("should call setSessionConfigOption for mode updates", async () => {
      const calls: Array<Record<string, any>> = [];
      const connection = {
        setSessionConfigOption: async (payload: any) => {
          calls.push(payload);
        },
      };

      await provider.setMode(connection as any, "session-123", "build", "mode-select");

      expect(calls).toEqual([
        {
          sessionId: "session-123",
          configId: "mode-select",
          value: "build",
        },
      ]);
    });
  });
});
