import { IAcpProvider, AcpProcessHandle, NewSessionResponse } from "../types";
import { ModelState, ModeState } from "../../types";
import { spawn } from "child_process";
import { Writable, Readable } from "node:stream";

const CLAUDE_ACP_COMMAND = "claude-agent-acp";

export class ClaudeAgentProvider implements IAcpProvider {
  readonly name = "claude";

  constructor(private readonly spawnProcess: typeof spawn = spawn) {}

  spawn(cwd: string): {
    process: AcpProcessHandle;
    input: WritableStream<Uint8Array>;
    output: ReadableStream<Uint8Array>;
  } {
    const executable = Bun.which(CLAUDE_ACP_COMMAND);
    if (!executable) {
      throw new Error(
        `[mimo-agent] Required executable '${CLAUDE_ACP_COMMAND}' not found on PATH`,
      );
    }

    const proc = this.spawnProcess(executable, [], {
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
      available_commands_update: "available_commands_update",
    };

    return mapping[updateType] ?? null;
  }
}
