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

describe("ChatStreamingPipeline", () => {
  beforeEach(async () => {
    await loadPipeline();
  });

  describe("thought chunk accumulation", () => {
    it("accumulates thought chunks into buffer", async () => {
      const { pipeline } = makePipeline();
      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleThoughtChunk("s1", "t1", "Hello ");
      pipeline.handleThoughtChunk("s1", "t1", "world");
      pipeline.handleThoughtChunk("s1", "t1", "!");
      const snap = pipeline.getStreamingSnapshot("s1", "t1");
      expect(snap.thoughtContent).toBe("Hello world!");
    });

    it("broadcasts thought_chunk with correct content", async () => {
      const mockBroadcast = mock(() => {});
      const { pipeline } = makePipeline(undefined, mockBroadcast);
      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleThoughtChunk("s1", "t1", "thinking...");
      const calls = (mockBroadcast as ReturnType<typeof mock>).mock.calls;
      const thoughtCalls = calls.filter(
        (c: any[]) => c[1]?.type === "thought_chunk",
      );
      expect(thoughtCalls.length).toBeGreaterThan(0);
      expect(thoughtCalls[0][1].content).toBe("thinking...");
    });
  });

  describe("message chunk accumulation", () => {
    it("accumulates message chunks into buffer", async () => {
      const { pipeline } = makePipeline();
      pipeline.handleMessageChunk("s1", "t1", "foo ");
      pipeline.handleMessageChunk("s1", "t1", "bar");
      const snap = pipeline.getStreamingSnapshot("s1", "t1");
      expect(snap.messageContent).toBe("foo bar");
    });

    it("broadcasts message_chunk on each call", async () => {
      const mockBroadcast = mock(() => {});
      const { pipeline } = makePipeline(undefined, mockBroadcast);
      pipeline.handleMessageChunk("s1", "t1", "chunk");
      const calls = (mockBroadcast as ReturnType<typeof mock>).mock.calls;
      const msgCalls = calls.filter(
        (c: any[]) => c[1]?.type === "message_chunk",
      );
      expect(msgCalls.length).toBeGreaterThan(0);
    });
  });

  describe("handleUsageUpdate broadcasts metadata only", () => {
    it("does NOT call saveMessage on usage_update", async () => {
      const mockSave = mock(async () => {});
      const { pipeline } = makePipeline(mockSave as any);

      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleThoughtChunk("s1", "t1", "deep thought");
      pipeline.handleMessageChunk("s1", "t1", "the answer");

      await pipeline.handleUsageUpdate(
        "s1",
        "t1",
        { inputTokens: 10 },
        { activeChatThreadId: "t1" },
      );

      expect((mockSave as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    it("does NOT clear buffers on usage_update", async () => {
      const { pipeline } = makePipeline();

      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleThoughtChunk("s1", "t1", "some thought");
      pipeline.handleMessageChunk("s1", "t1", "some message");

      await pipeline.handleUsageUpdate(
        "s1",
        "t1",
        {},
        { activeChatThreadId: "t1" },
      );

      const snap = pipeline.getStreamingSnapshot("s1", "t1");
      expect(snap.thoughtContent).toBe("some thought");
      expect(snap.messageContent).toBe("some message");
    });

    it("broadcasts usage_update event", async () => {
      const mockBroadcast = mock(() => {});
      const { pipeline } = makePipeline(undefined, mockBroadcast);

      pipeline.handleMessageChunk("s1", "t1", "answer");
      await pipeline.handleUsageUpdate(
        "s1",
        "t1",
        { cost: 1 },
        { activeChatThreadId: "t1" },
      );

      const calls = (mockBroadcast as ReturnType<typeof mock>).mock.calls;
      const usageCalls = calls.filter(
        (c: any[]) => c[1]?.type === "usage_update",
      );
      expect(usageCalls.length).toBe(1);
      expect(usageCalls[0][1].usage).toEqual({ cost: 1 });
    });
  });

  describe("handlePromptCompleted assembles and saves message", () => {
    it("assembles details format when thoughts are present", async () => {
      let savedMessage: ChatMessage | null = null;
      const mockSave = mock(async (_sid: string, msg: ChatMessage) => {
        savedMessage = msg;
      });
      const { pipeline } = makePipeline(mockSave as any);

      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleThoughtChunk("s1", "t1", "deep thought");
      pipeline.handleMessageChunk("s1", "t1", "the answer");

      await pipeline.handlePromptCompleted("s1", "t1", {
        activeChatThreadId: "t1",
      });

      expect(savedMessage).not.toBeNull();
      expect((savedMessage as unknown as ChatMessage).content).toContain(
        "<details>",
      );
      expect((savedMessage as unknown as ChatMessage).content).toContain(
        "deep thought",
      );
      expect((savedMessage as unknown as ChatMessage).content).toContain(
        "the answer",
      );
    });

    it("uses plain message content when no thoughts present", async () => {
      let savedMessage: ChatMessage | null = null;
      const mockSave = mock(async (_sid: string, msg: ChatMessage) => {
        savedMessage = msg;
      });
      const { pipeline } = makePipeline(mockSave as any);

      pipeline.handleMessageChunk("s1", "t1", "direct answer");

      await pipeline.handlePromptCompleted("s1", "t1", {
        activeChatThreadId: "t1",
      });

      expect(savedMessage).not.toBeNull();
      expect((savedMessage as unknown as ChatMessage).content).toBe(
        "direct answer",
      );
      expect((savedMessage as unknown as ChatMessage).content).not.toContain(
        "<details>",
      );
    });

    it("clears buffers after handlePromptCompleted completes", async () => {
      const { pipeline } = makePipeline();

      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleThoughtChunk("s1", "t1", "some thought");
      pipeline.handleMessageChunk("s1", "t1", "some message");

      await pipeline.handlePromptCompleted("s1", "t1", {
        activeChatThreadId: "t1",
      });

      const snap = pipeline.getStreamingSnapshot("s1", "t1");
      expect(snap.thoughtContent).toBe("");
      expect(snap.messageContent).toBe("");
    });

    it("does not save when buffers are empty", async () => {
      const mockSave = mock(async () => {});
      const { pipeline } = makePipeline(mockSave as any);

      await pipeline.handlePromptCompleted("s1", "t1", {
        activeChatThreadId: "t1",
      });

      expect((mockSave as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    it("broadcasts prompt_completed event", async () => {
      const mockBroadcast = mock(() => {});
      const { pipeline } = makePipeline(undefined, mockBroadcast);

      pipeline.handleMessageChunk("s1", "t1", "answer");
      await pipeline.handlePromptCompleted("s1", "t1", {
        activeChatThreadId: "t1",
      });

      const calls = (mockBroadcast as ReturnType<typeof mock>).mock.calls;
      const completedCalls = calls.filter(
        (c: any[]) => c[1]?.type === "prompt_completed",
      );
      expect(completedCalls.length).toBe(1);
    });

    it("includes usage in prompt_completed broadcast when provided", async () => {
      const mockBroadcast = mock(() => {});
      const { pipeline } = makePipeline(undefined, mockBroadcast);

      pipeline.handleMessageChunk("s1", "t1", "answer");
      await pipeline.handlePromptCompleted(
        "s1",
        "t1",
        { activeChatThreadId: "t1" },
        { inputTokens: 12, outputTokens: 34 },
      );

      const calls = (mockBroadcast as ReturnType<typeof mock>).mock.calls;
      const completedCalls = calls.filter(
        (c: any[]) => c[1]?.type === "prompt_completed",
      );
      expect(completedCalls.length).toBe(1);
      expect(completedCalls[0][1].usage).toEqual({
        inputTokens: 12,
        outputTokens: 34,
      });
    });
  });

  describe("getStreamingSnapshot", () => {
    it("reflects current buffer state", async () => {
      const { pipeline } = makePipeline();
      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleThoughtChunk("s1", "t1", "my thought");
      pipeline.handleMessageChunk("s1", "t1", "my message");

      const snap = pipeline.getStreamingSnapshot("s1", "t1");
      expect(snap.thoughtContent).toBe("my thought");
      expect(snap.messageContent).toBe("my message");
    });

    it("returns empty strings for unknown thread", async () => {
      const { pipeline } = makePipeline();
      const snap = pipeline.getStreamingSnapshot(
        "unknown-session",
        "no-thread",
      );
      expect(snap.thoughtContent).toBe("");
      expect(snap.messageContent).toBe("");
    });
  });

  describe("clearBuffers", () => {
    it("removes all buffered state for the thread", async () => {
      const { pipeline } = makePipeline();
      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleThoughtChunk("s1", "t1", "thought");
      pipeline.handleMessageChunk("s1", "t1", "message");

      pipeline.clearBuffers("s1", "t1");

      const snap = pipeline.getStreamingSnapshot("s1", "t1");
      expect(snap.thoughtContent).toBe("");
      expect(snap.messageContent).toBe("");
    });
  });

  describe("prompt in-flight tracking", () => {
    it("tracks and clears per-thread prompt-in-flight state", async () => {
      const { pipeline } = makePipeline();

      expect(pipeline.isPromptInFlight("s1", "t1")).toBe(false);
      pipeline.setPromptInFlight("s1", "t1");
      expect(pipeline.isPromptInFlight("s1", "t1")).toBe(true);

      pipeline.clearPromptInFlight("s1", "t1");
      expect(pipeline.isPromptInFlight("s1", "t1")).toBe(false);
    });

    it("clears prompt-in-flight when buffers are cleared", async () => {
      const { pipeline } = makePipeline();

      pipeline.setPromptInFlight("s1", "t1");
      expect(pipeline.isPromptInFlight("s1", "t1")).toBe(true);

      pipeline.clearBuffers("s1", "t1");
      expect(pipeline.isPromptInFlight("s1", "t1")).toBe(false);
    });
  });

  describe("duration tracking", () => {
    it("sets duration metadata in saved message on prompt_completed", async () => {
      let savedMessage: ChatMessage | null = null;
      const mockSave = mock(async (_sid: string, msg: ChatMessage) => {
        savedMessage = msg;
      });
      const { pipeline } = makePipeline(mockSave as any);

      const originalNow = Date.now;
      let now = 1700000000000;
      Date.now = () => (now += 25);
      try {
        pipeline.handleThoughtStart("s1", "t1");
        pipeline.handleMessageChunk("s1", "t1", "answer");

        await pipeline.handlePromptCompleted("s1", "t1", {
          activeChatThreadId: "t1",
        });
      } finally {
        Date.now = originalNow;
      }

      expect(savedMessage).not.toBeNull();
      expect(
        (savedMessage as unknown as ChatMessage).metadata?.duration,
      ).toBeDefined();
      expect(
        typeof (savedMessage as unknown as ChatMessage).metadata?.durationMs,
      ).toBe("number");
    });
  });

  describe("flushAsCancelled", () => {
    it("persists buffered partial as a cancelled assistant message", async () => {
      const saved: Array<{ msg: ChatMessage; thread?: string }> = [];
      const mockSave = mock(
        async (_sid: string, msg: ChatMessage, threadId?: string) => {
          saved.push({ msg, thread: threadId });
        },
      );
      const { pipeline } = makePipeline(mockSave as any);

      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleThoughtChunk("s1", "t1", "thinking…");
      pipeline.handleMessageChunk("s1", "t1", "partial answer");

      await pipeline.flushAsCancelled("s1", "t1", { activeChatThreadId: "t1" });

      expect(saved.length).toBe(1);
      expect(saved[0].thread).toBe("t1");
      expect(saved[0].msg.role).toBe("assistant");
      expect(saved[0].msg.metadata?.cancelled).toBe(true);
      expect(saved[0].msg.content).toContain("thinking…");
      expect(saved[0].msg.content).toContain("partial answer");
      expect(saved[0].msg.content).toContain(
        "<details><summary>Thought Process</summary>",
      );

      const snap = pipeline.getStreamingSnapshot("s1", "t1");
      expect(snap.thoughtContent).toBe("");
      expect(snap.messageContent).toBe("");
    });

    it("persists an empty cancelled message when no buffered output exists", async () => {
      const mockSave = mock(async () => {});
      const { pipeline } = makePipeline(mockSave as any);

      await pipeline.flushAsCancelled("s1", "t1", { activeChatThreadId: "t1" });

      expect((mockSave as ReturnType<typeof mock>).mock.calls.length).toBe(1);
      const saved = (mockSave as ReturnType<typeof mock>).mock.calls[0][1];
      expect(saved.role).toBe("assistant");
      expect(saved.content).toBe("");
      expect(saved.metadata?.cancelled).toBe(true);
    });

    it("suppresses a trailing handleUsageUpdate so the same turn is not double-saved", async () => {
      const mockSave = mock(async () => {});
      const { pipeline } = makePipeline(mockSave as any);

      pipeline.handleMessageChunk("s1", "t1", "partial");
      await pipeline.flushAsCancelled("s1", "t1", { activeChatThreadId: "t1" });
      expect((mockSave as ReturnType<typeof mock>).mock.calls.length).toBe(1);

      // Late chunk + usage_update arrive after cancel; must NOT save again.
      pipeline.handleMessageChunk("s1", "t1", "late");
      await pipeline.handleUsageUpdate(
        "s1",
        "t1",
        {},
        { activeChatThreadId: "t1" },
      );

      expect((mockSave as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    it("clears the cancelled flag so a subsequent turn can save normally", async () => {
      const mockSave = mock(async () => {});
      const { pipeline } = makePipeline(mockSave as any);

      pipeline.handleMessageChunk("s1", "t1", "first");
      await pipeline.flushAsCancelled("s1", "t1", { activeChatThreadId: "t1" });

      // Trailing usage_update from the cancelled turn — drains the flag.
      await pipeline.handleUsageUpdate(
        "s1",
        "t1",
        {},
        { activeChatThreadId: "t1" },
      );
      expect((mockSave as ReturnType<typeof mock>).mock.calls.length).toBe(1);

      // Next turn — normal save should happen on prompt_completed.
      pipeline.handleMessageChunk("s1", "t1", "second");
      await pipeline.handlePromptCompleted("s1", "t1", {
        activeChatThreadId: "t1",
      });
      expect((mockSave as ReturnType<typeof mock>).mock.calls.length).toBe(2);
      const lastCall = (mockSave as ReturnType<typeof mock>).mock.calls[1];
      expect(lastCall[1].metadata?.cancelled).toBeUndefined();
    });
  });

  describe("multi-phase response handling", () => {
    it("5.1 handleUsageUpdate does not clear buffers", async () => {
      const { pipeline } = makePipeline();

      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleThoughtChunk("s1", "t1", "thinking");
      pipeline.handleMessageChunk("s1", "t1", "first chunk");

      await pipeline.handleUsageUpdate(
        "s1",
        "t1",
        {},
        { activeChatThreadId: "t1" },
      );

      const snap = pipeline.getStreamingSnapshot("s1", "t1");
      expect(snap.thoughtContent).toBe("thinking");
      expect(snap.messageContent).toBe("first chunk");
    });

    it("5.2 handlePromptCompleted saves message and clears buffers", async () => {
      const saved: ChatMessage[] = [];
      const mockSave = mock(async (_sid: string, msg: ChatMessage) => {
        saved.push(msg);
      });
      const { pipeline } = makePipeline(mockSave as any);

      pipeline.handleMessageChunk("s1", "t1", "the answer");

      await pipeline.handlePromptCompleted("s1", "t1", {
        activeChatThreadId: "t1",
      });

      expect(saved.length).toBe(1);
      expect(saved[0].content).toBe("the answer");

      const snap = pipeline.getStreamingSnapshot("s1", "t1");
      expect(snap.messageContent).toBe("");
    });

    it("5.3 usage_update then message_chunk then prompt_completed saves one combined message", async () => {
      const saved: ChatMessage[] = [];
      const mockSave = mock(async (_sid: string, msg: ChatMessage) => {
        saved.push(msg);
      });
      const { pipeline } = makePipeline(mockSave as any);

      pipeline.handleMessageChunk("s1", "t1", "phase one ");

      await pipeline.handleUsageUpdate(
        "s1",
        "t1",
        {},
        { activeChatThreadId: "t1" },
      );
      expect(saved.length).toBe(0);

      pipeline.handleMessageChunk("s1", "t1", "phase two");

      await pipeline.handlePromptCompleted("s1", "t1", {
        activeChatThreadId: "t1",
      });

      expect(saved.length).toBe(1);
      expect(saved[0].content).toBe("phase one phase two");
    });
  });
});
