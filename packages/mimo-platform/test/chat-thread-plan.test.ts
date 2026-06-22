import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { ChatMessage } from "../src/domain/sessions/chat.ts";

type SaveMessageFn = (
  sessionId: string,
  message: ChatMessage,
  chatThreadId?: string,
) => Promise<void>;

type BroadcastFn = (
  sessionId: string,
  message: Record<string, unknown>,
) => void;

let ChatStreamingPipeline: any;

async function loadPipeline() {
  const mod = await import("../src/domain/sessions/streaming-pipeline.ts");
  ChatStreamingPipeline = mod.ChatStreamingPipeline;
}

function makePipeline(saveMessage?: SaveMessageFn, broadcast?: BroadcastFn) {
  const mockSave = saveMessage ?? mock(async () => {});
  const mockBroadcast = broadcast ?? mock(() => {});
  const chat = { saveMessage: mockSave };
  return {
    pipeline: new ChatStreamingPipeline(chat, mockBroadcast),
    mockSave,
    mockBroadcast,
  };
}

const PLAN_A = [
  { content: "Read files", priority: "high", status: "completed" },
  { content: "Write fix", priority: "medium", status: "in_progress" },
];
const PLAN_B = [
  { content: "Design schema", priority: "high", status: "in_progress" },
  { content: "Write tests", priority: "low", status: "pending" },
];

describe("ChatStreamingPipeline plan handling", () => {
  beforeEach(async () => {
    await loadPipeline();
  });

  it("stores a plan per chat thread and exposes it via getThreadPlan", () => {
    const { pipeline } = makePipeline();
    pipeline.handlePlan("s1", "t1", PLAN_A);
    expect(pipeline.getThreadPlan("s1", "t1")).toEqual(PLAN_A);
  });

  it("replaces the thread plan entirely on the next update", () => {
    const { pipeline } = makePipeline();
    pipeline.handlePlan("s1", "t1", PLAN_A);
    pipeline.handlePlan("s1", "t1", PLAN_B);
    expect(pipeline.getThreadPlan("s1", "t1")).toEqual(PLAN_B);
  });

  it("keeps plans isolated per thread", () => {
    const { pipeline } = makePipeline();
    pipeline.handlePlan("s1", "t1", PLAN_A);
    pipeline.handlePlan("s1", "t2", PLAN_B);
    expect(pipeline.getThreadPlan("s1", "t1")).toEqual(PLAN_A);
    expect(pipeline.getThreadPlan("s1", "t2")).toEqual(PLAN_B);
  });

  it("returns an empty plan for a thread that has none", () => {
    const { pipeline } = makePipeline();
    expect(pipeline.getThreadPlan("s1", "t-none")).toEqual([]);
  });

  it("broadcasts a live plan message scoped to the chat thread", () => {
    const mockBroadcast = mock(() => {});
    const { pipeline } = makePipeline(undefined, mockBroadcast);
    pipeline.handlePlan("s1", "t1", PLAN_A);
    const calls = (mockBroadcast as ReturnType<typeof mock>).mock.calls;
    const planCalls = calls.filter((c: any[]) => c[1]?.type === "plan");
    expect(planCalls.length).toBe(1);
    expect(planCalls[0][0]).toBe("s1");
    expect(planCalls[0][1].chatThreadId).toBe("t1");
    expect(planCalls[0][1].entries).toEqual(PLAN_A);
  });

  it("keeps the plan after the turn completes (keep-last-snapshot)", async () => {
    const { pipeline } = makePipeline();
    pipeline.handleThoughtStart("s1", "t1", "p1");
    pipeline.handleThoughtChunk("s1", "t1", "thinking", "p1");
    pipeline.handlePlan("s1", "t1", PLAN_A);
    pipeline.handleMessageChunk("s1", "t1", "done", "p1");
    await pipeline.handlePromptCompleted("s1", "t1", {}, undefined, "p1");
    expect(pipeline.getThreadPlan("s1", "t1")).toEqual(PLAN_A);
  });

  it("clears the thread plan via clearThreadPlan", () => {
    const { pipeline } = makePipeline();
    pipeline.handlePlan("s1", "t1", PLAN_A);
    pipeline.clearThreadPlan("s1", "t1");
    expect(pipeline.getThreadPlan("s1", "t1")).toEqual([]);
  });

  it("never persists plan entries into saved assistant message content", async () => {
    const saved: ChatMessage[] = [];
    const save: SaveMessageFn = async (_s, msg) => {
      saved.push(msg);
    };
    const { pipeline } = makePipeline(save);
    pipeline.handleThoughtStart("s1", "t1", "p1");
    pipeline.handleThoughtChunk("s1", "t1", "let me plan", "p1");
    pipeline.handlePlan("s1", "t1", PLAN_A);
    pipeline.handleMessageChunk("s1", "t1", "all set", "p1");
    await pipeline.handlePromptCompleted("s1", "t1", {}, undefined, "p1");
    // allow the prompt-completion drain timer to flush
    await new Promise((r) => setTimeout(r, 200));
    expect(saved.length).toBe(1);
    expect(saved[0].content).not.toContain("Read files");
    expect(saved[0].content).not.toContain("Write fix");
    expect(saved[0].content).not.toContain("priority");
  });
});
