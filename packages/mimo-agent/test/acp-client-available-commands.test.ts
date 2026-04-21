import { describe, expect, it, mock } from "bun:test";
import { AcpClient } from "../src/acp/client";

describe("AcpClient available_commands_update", () => {
  it("routes available_commands_update to dedicated callback", () => {
    const onGenericUpdate = mock(() => {});
    const onAvailableCommandsUpdate = mock(() => {});

    const provider = {
      name: "test",
      spawn: () => {
        throw new Error("not used");
      },
      extractState: () => ({}),
      setModel: async () => {},
      setMode: async () => {},
      mapUpdateType: (updateType: string) => updateType,
    };

    const client = new AcpClient(provider as any, "session-1", {
      onThoughtStart: () => {},
      onThoughtChunk: () => {},
      onThoughtEnd: () => {},
      onMessageChunk: () => {},
      onUsageUpdate: () => {},
      onGenericUpdate,
      onToolCall: () => {},
      onToolCallUpdate: () => {},
      onPermissionRequest: async () => ({ outcome: "allow" as const }),
      onAvailableCommandsUpdate,
    } as any);

    (client as any).session = {
      sessionId: "session-1",
      acpSessionId: "acp-1",
      connection: {},
      stdin: new WritableStream<Uint8Array>(),
    };

    (client as any).handleSessionUpdate({
      sessionUpdate: "available_commands_update",
      commands: [{ name: "/clear", description: "Clear thread" }],
    });

    expect(onAvailableCommandsUpdate).toHaveBeenCalledTimes(1);
    expect(onAvailableCommandsUpdate.mock.calls[0]?.[1]).toEqual([
      { name: "/clear", description: "Clear thread" },
    ]);
    expect(onGenericUpdate).not.toHaveBeenCalled();
  });
});
