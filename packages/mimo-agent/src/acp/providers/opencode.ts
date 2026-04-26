import { IAcpProvider, AcpProcessHandle, NewSessionResponse } from "../types";
import { ModelState, ModeState } from "../../types";
import { spawn } from "child_process";
import { Writable, Readable } from "node:stream";

export class OpencodeProvider implements IAcpProvider {
  readonly name = "opencode";

  spawn(cwd: string): {
    process: AcpProcessHandle;
    input: WritableStream<Uint8Array>;
    output: ReadableStream<Uint8Array>;
  } {
    const proc = spawn("opencode", ["acp"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      process: proc as unknown as AcpProcessHandle,
      input: Writable.toWeb(proc.stdin!) as WritableStream<Uint8Array>,
      output: Readable.toWeb(proc.stdout!) as unknown as ReadableStream<Uint8Array>,
    };
  }

  extractState(response: NewSessionResponse): {
    modelState?: ModelState;
    modeState?: ModeState;
  } {
    const result: { modelState?: ModelState; modeState?: ModeState } = {};

    // Try modern configOptions first
    if (response.configOptions) {
      const modelConfig = response.configOptions.find(
        (opt) => opt.category === "model" && opt.type === "select",
      );
      const modeConfig = response.configOptions.find(
        (opt) => opt.category === "mode" && opt.type === "select",
      );

      if (modelConfig && modelConfig.type === "select") {
        const availableOptions = Array.isArray(modelConfig.options)
          ? modelConfig.options.map((opt) => ({
              value: opt.value,
              name: opt.name,
              description: opt.description,
            }))
          : [];

        result.modelState = {
          currentModelId:
            modelConfig.currentValue || availableOptions[0]?.value || "",
          availableModels: availableOptions,
          optionId: modelConfig.id,
        };
      }

      if (modeConfig && modeConfig.type === "select") {
        const availableOptions = Array.isArray(modeConfig.options)
          ? modeConfig.options.map((opt) => ({
              value: opt.value,
              name: opt.name,
              description: opt.description,
            }))
          : [];

        result.modeState = {
          currentModeId:
            modeConfig.currentValue || availableOptions[0]?.value || "",
          availableModes: availableOptions,
          optionId: modeConfig.id,
        };
      }
    }
    // Fallback to legacy format (models/modes fields)
    else if (response.models) {
      // Extract model state from legacy 'models' field
      if (response.models) {
        const models = response.models;
        const availableOptions = Array.isArray(models.availableModels)
          ? models.availableModels.map((m) => ({
              value: m.modelId || m.id || "",
              name: m.name || m.modelId || m.id || "",
              description: m.description,
            }))
          : [];

        result.modelState = {
          currentModelId:
            models.currentModelId || availableOptions[0]?.value || "",
          availableModels: availableOptions,
          optionId: "model",
        };
      }

      // Extract mode state from legacy 'modes' field
      if (response.modes) {
        const modes = response.modes;
        const availableOptions = Array.isArray(modes.availableModes)
          ? modes.availableModes.map((m) => ({
              value: m.id,
              name: m.name || m.id,
              description: m.description,
            }))
          : [];

        result.modeState = {
          currentModeId:
            modes.currentModeId || availableOptions[0]?.value || "",
          availableModes: availableOptions,
          optionId: "mode",
        };
      }
    }

    return result;
  }

  async setModel(
    connection: any,
    acpSessionId: string,
    modelId: string,
    optionId: string,
  ): Promise<void> {
    // Opencode doesn't support setSessionConfigOption, always use extMethod
    await connection.extMethod("session/set_model", {
      sessionId: acpSessionId,
      modelId: modelId,
    });
  }

  async setMode(
    connection: any,
    acpSessionId: string,
    modeId: string,
    optionId: string,
  ): Promise<void> {
    // Opencode doesn't support setSessionConfigOption, always use extMethod
    // Note: opencode expects "modeId", not "mode"
    await connection.extMethod("session/set_mode", {
      sessionId: acpSessionId,
      modeId: modeId,
    });
  }

  mapUpdateType(updateType: string): string | null {
    const mapping: Record<string, string | null> = {
      agent_thought_chunk: "thought_chunk",
      agent_message_chunk: "message_chunk",
      usage_update: "usage_update",
      tool_call: "tool_call",
      tool_call_update: "tool_call_update",
      available_commands_update: "available_commands_update",
      availableCommandsUpdate: "available_commands_update",
      available_commands: "available_commands_update",
    };

    return mapping[updateType] ?? null;
  }
}
