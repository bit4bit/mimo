import { IAcpProvider, AcpProcessHandle, NewSessionResponse } from "../types";
import { ModelState, ModeState } from "../../types";
import * as acp from "@agentclientprotocol/sdk";
import { ClaudeAcpAgent } from "@agentclientprotocol/claude-agent-acp";

export class ClaudeAgentProvider implements IAcpProvider {
  readonly name = "claude";

  spawn(_cwd: string): {
    process: AcpProcessHandle;
    input: WritableStream<Uint8Array>;
    output: ReadableStream<Uint8Array>;
  } {
    // Two in-memory pipes connect the client and agent sides without a subprocess.
    // clientToAgent: client writes outgoing messages → agent reads them
    // agentToClient: agent writes outgoing messages → client reads them
    const clientToAgent = new TransformStream<Uint8Array, Uint8Array>();
    const agentToClient = new TransformStream<Uint8Array, Uint8Array>();

    const agentStream = acp.ndJsonStream(
      agentToClient.writable,
      clientToAgent.readable,
    );
    const agentConnection = new acp.AgentSideConnection(
      (conn) => new ClaudeAcpAgent(conn),
      agentStream,
    );

    let killed = false;
    const closeCallbacks: Array<(code: number | null) => void> = [];
    const errorCallbacks: Array<(err: Error) => void> = [];

    agentConnection.closed
      .then(() => closeCallbacks.forEach((cb) => cb(0)))
      .catch((err) => errorCallbacks.forEach((cb) => cb(err)));

    const process: AcpProcessHandle = {
      get killed() {
        return killed;
      },
      kill() {
        if (killed) return;
        killed = true;
        agentToClient.writable.close().catch(() => {});
      },
      on(event: "close" | "error", cb: any) {
        if (event === "close") closeCallbacks.push(cb);
        else if (event === "error") errorCallbacks.push(cb);
      },
    };

    return {
      process,
      input: clientToAgent.writable,
      output: agentToClient.readable,
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
