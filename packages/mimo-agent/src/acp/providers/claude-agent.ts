import { IAcpProvider, NewSessionResponse } from "../types";
import { ModelState, ModeState } from "../../types";
import { spawn, ChildProcess } from "child_process";
import { Readable, Writable } from "node:stream";

export class ClaudeAgentProvider implements IAcpProvider {
  readonly name = "claude";

  spawn(cwd: string): {
    process: ChildProcess;
    stdin: Writable;
    stdout: Readable;
    stderr?: Readable;
  } {
    const proc = spawn("claude-agent-acp", [], {
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

  extractState(response: NewSessionResponse): {
    modelState?: ModelState;
    modeState?: ModeState;
  } {
    const result: { modelState?: ModelState; modeState?: ModeState } = {};

    if (!response.configOptions) return result;

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

    return result;
  }

  async setModel(
    connection: any,
    acpSessionId: string,
    modelId: string,
    optionId: string,
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
    optionId: string,
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
      tool_call: "tool_call",
      tool_call_update: "tool_call_update",
    };

    return mapping[updateType] ?? null;
  }
}
