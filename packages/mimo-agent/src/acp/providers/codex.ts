import { IAcpProvider, NewSessionResponse } from "../types";
import { ModelState, ModeState } from "../../types";
import { spawn, ChildProcess } from "child_process";
import { Readable, Writable } from "node:stream";

export class CodexProvider implements IAcpProvider {
  readonly name = "codex";

  spawn(cwd: string): {
    process: ChildProcess;
    stdin: Writable;
    stdout: Readable;
    stderr?: Readable;
  } {
    const proc = spawn("codex-acp", [], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      process: proc,
      stdin: proc.stdin!,
      stdout: proc.stdout!,
      stderr: proc.stderr!,
    };
  }

  extractState(
    response: NewSessionResponse
  ): {
    modelState?: ModelState;
    modeState?: ModeState;
  } {
    const result: { modelState?: ModelState; modeState?: ModeState } = {};

    if (response.configOptions) {
      const modelConfig = response.configOptions.find(
        (opt) => opt.category === "model" && opt.type === "select"
      );
      const modeConfig = response.configOptions.find(
        (opt) => opt.category === "mode" && opt.type === "select"
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

    if (!result.modelState && response.models) {
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

    if (!result.modeState && response.modes) {
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

    return result;
  }

  async setModel(
    connection: any,
    acpSessionId: string,
    modelId: string,
    optionId: string
  ): Promise<void> {
    await connection.setSessionConfigOption({
      sessionId: acpSessionId,
      configId: optionId,
      value: modelId,
    });
  }

  async setMode(
    connection: any,
    acpSessionId: string,
    modeId: string,
    optionId: string
  ): Promise<void> {
    await connection.setSessionConfigOption({
      sessionId: acpSessionId,
      configId: optionId,
      value: modeId,
    });
  }

  mapUpdateType(updateType: string): string | null {
    const mapping: Record<string, string | null> = {
      agent_thought_chunk: "thought_chunk",
      agent_message_chunk: "message_chunk",
      usage_update: "usage_update",
      plan_update: "plan_update",
      tool_call_update: "tool_call_update",
      config_option_update: "config_option_update",
      available_commands_update: "available_commands_update",
    };

    if (updateType in mapping) {
      return mapping[updateType] ?? null;
    }

    return null;
  }
}
