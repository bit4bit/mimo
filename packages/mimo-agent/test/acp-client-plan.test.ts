import { describe, expect, it, mock } from "bun:test";
import { AcpClient } from "../src/acp/client";

function makeClient(overrides: Record<string, unknown>) {
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
    onGenericUpdate: () => {},
    onToolCall: () => {},
    onToolCallUpdate: () => {},
    onAvailableCommandsUpdate: () => {},
    onPermissionRequest: async () => ({ outcome: "allow" as const }),
    ...overrides,
  } as any);

  (client as any).session = {
    sessionId: "session-1",
    acpSessionId: "acp-1",
    connection: {},
    stdin: new WritableStream<Uint8Array>(),
  };

  return client;
}

describe("AcpClient plan update", () => {
  it("routes a plan session update to the onPlan callback with its entries", () => {
    const onPlan = mock(() => {});
    const onGenericUpdate = mock(() => {});

    const client = makeClient({ onPlan, onGenericUpdate });

    const entries = [
      { content: "Read files", priority: "high", status: "completed" },
      { content: "Write fix", priority: "medium", status: "in_progress" },
      { content: "Run tests", priority: "low", status: "pending" },
    ];

    (client as any).handleSessionUpdate({
      sessionUpdate: "plan",
      entries,
    });

    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(onPlan.mock.calls[0]?.[0]).toBe("session-1");
    expect(onPlan.mock.calls[0]?.[1]).toEqual(entries);
    expect(onGenericUpdate).not.toHaveBeenCalled();
  });

  it("forwards an empty entries list as an empty plan", () => {
    const onPlan = mock(() => {});
    const client = makeClient({ onPlan });

    (client as any).handleSessionUpdate({
      sessionUpdate: "plan",
      entries: [],
    });

    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(onPlan.mock.calls[0]?.[1]).toEqual([]);
  });
});
