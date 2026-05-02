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

  describe("handleUsageUpdate assembles message", () => {
    it("assembles details format when thoughts are present", async () => {
      let savedMessage: ChatMessage | null = null;
      const mockSave = mock(async (_sid: string, msg: ChatMessage) => {
        savedMessage = msg;
      });
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

      await pipeline.handleUsageUpdate(
        "s1",
        "t1",
        {},
        { activeChatThreadId: "t1" },
      );

      expect(savedMessage).not.toBeNull();
      expect((savedMessage as unknown as ChatMessage).content).toBe(
        "direct answer",
      );
      expect((savedMessage as unknown as ChatMessage).content).not.toContain(
        "<details>",
      );
    });

    it("clears buffers after handleUsageUpdate completes", async () => {
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
      expect(snap.thoughtContent).toBe("");
      expect(snap.messageContent).toBe("");
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

  describe("duration tracking", () => {
    it("sets duration metadata in saved message", async () => {
      let savedMessage: ChatMessage | null = null;
      const mockSave = mock(async (_sid: string, msg: ChatMessage) => {
        savedMessage = msg;
      });
      const { pipeline } = makePipeline(mockSave as any);

      pipeline.handleThoughtStart("s1", "t1");
      pipeline.handleMessageChunk("s1", "t1", "answer");

      await new Promise((r) => setTimeout(r, 10));

      await pipeline.handleUsageUpdate(
        "s1",
        "t1",
        {},
        { activeChatThreadId: "t1" },
      );

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

    it("does not persist anything when no buffered output exists", async () => {
      const mockSave = mock(async () => {});
      const { pipeline } = makePipeline(mockSave as any);

      await pipeline.flushAsCancelled("s1", "t1", { activeChatThreadId: "t1" });

      expect((mockSave as ReturnType<typeof mock>).mock.calls.length).toBe(0);
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

      // Next turn — normal save should happen.
      pipeline.handleMessageChunk("s1", "t1", "second");
      await pipeline.handleUsageUpdate(
        "s1",
        "t1",
        {},
        { activeChatThreadId: "t1" },
      );
      expect((mockSave as ReturnType<typeof mock>).mock.calls.length).toBe(2);
      const lastCall = (mockSave as ReturnType<typeof mock>).mock.calls[1];
      expect(lastCall[1].metadata?.cancelled).toBeUndefined();
    });
  });
});
