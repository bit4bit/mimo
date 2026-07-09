import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("Thread-switch streaming reconstruction", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "..", "..", "public", "js", "chat.js"),
    "utf-8",
  );

  describe("Per-switch reconstruction state in ChatState", () => {
    it("defines historyLoaded (boolean, default false)", () => {
      expect(source).toContain("historyLoaded: false");
    });

    it("defines pendingStreamingSnapshot (default null)", () => {
      expect(source).toContain("pendingStreamingSnapshot: null");
    });

    it("defines streamingSnapshotTimer (default null)", () => {
      expect(source).toContain("streamingSnapshotTimer: null");
    });
  });

  describe("prepareThreadSwitch resets reconstruction state", () => {
    const fnMatch = source.match(
      /function prepareThreadSwitch\(\)[\s\S]*?\n}/m,
    );

    it("exists", () => {
      expect(fnMatch).toBeTruthy();
    });

    it("resets historyLoaded to false", () => {
      expect(fnMatch![0]).toContain("ChatState.historyLoaded = false");
    });

    it("resets pendingStreamingSnapshot to null", () => {
      expect(fnMatch![0]).toContain(
        "ChatState.pendingStreamingSnapshot = null",
      );
    });

    it("clears the streamingSnapshotTimer", () => {
      expect(fnMatch![0]).toContain("ChatState.streamingSnapshotTimer");
      expect(fnMatch![0]).toContain(
        "clearTimeout(ChatState.streamingSnapshotTimer)",
      );
    });
  });

  describe("handleStreamingState buffers when history hasn't loaded", () => {
    const fnMatch = source.match(/function handleStreamingState[\s\S]*?^}/m);

    it("exists", () => {
      expect(fnMatch).toBeTruthy();
    });

    it("checks historyLoaded before applying", () => {
      expect(fnMatch![0]).toContain("!ChatState.historyLoaded");
    });

    it("stores data into pendingStreamingSnapshot when history not loaded", () => {
      expect(fnMatch![0]).toContain(
        "ChatState.pendingStreamingSnapshot = data",
      );
    });

    it("starts a safety timeout timer when buffering", () => {
      expect(fnMatch![0]).toContain(
        "ChatState.streamingSnapshotTimer = setTimeout",
      );
      expect(fnMatch![0]).toContain("2000");
    });

    it("returns without applying when buffering", () => {
      // The buffer branch must return early before the outer-level
      // applyStreamingSnapshot(data) call at the end of the function.
      const bufferBranch = fnMatch![0].match(
        /if \(!ChatState\.historyLoaded\) \{[\s\S]*?\n  \}/m,
      );
      expect(bufferBranch).toBeTruthy();
      // The synchronous portion of the buffer branch must not call
      // applyStreamingSnapshot (only the safety-timeout callback does).
      const syncPortion = bufferBranch![0].split(
        /ChatState\.streamingSnapshotTimer = setTimeout/,
      )[0];
      expect(syncPortion).not.toContain("applyStreamingSnapshot");
    });

    it("applies normally via applyStreamingSnapshot when history is loaded", () => {
      expect(fnMatch![0]).toContain("applyStreamingSnapshot(data)");
    });

    it("guards against non-active chatThreadId", () => {
      expect(fnMatch![0]).toContain("data.chatThreadId !== activeThreadId");
    });
  });

  describe("applyStreamingSnapshot builds the bubble and renders partial", () => {
    const fnMatch = source.match(/function applyStreamingSnapshot[\s\S]*?^}/m);

    it("exists", () => {
      expect(fnMatch).toBeTruthy();
    });

    it("sets currentPromptId from promptId when valid", () => {
      expect(fnMatch![0]).toContain("ChatState.currentPromptId = promptId");
    });

    it("clears replayRequested when restoring promptId", () => {
      expect(fnMatch![0]).toContain("ChatState.replayRequested = false");
    });

    it("sets streaming.reconstructed", () => {
      expect(fnMatch![0]).toContain("ChatState.streaming.reconstructed = true");
    });

    it("inserts the streaming message element", () => {
      expect(fnMatch![0]).toContain("insertStreamingMessage()");
    });

    it("appends messageContent to streaming.content", () => {
      expect(fnMatch![0]).toContain(
        "ChatState.streaming.content += messageContent",
      );
    });
  });

  describe("loadChatHistory applies buffered snapshot after rendering", () => {
    const fnMatch = source.match(/function loadChatHistory[\s\S]*?^}/m);

    it("exists", () => {
      expect(fnMatch).toBeTruthy();
    });

    it("sets historyLoaded to true after rendering messages", () => {
      expect(fnMatch![0]).toContain("ChatState.historyLoaded = true");
    });

    it("applies pendingStreamingSnapshot if present after setting historyLoaded", () => {
      expect(fnMatch![0]).toContain("if (ChatState.pendingStreamingSnapshot)");
      expect(fnMatch![0]).toContain("applyStreamingSnapshot(snapshot)");
    });

    it("clears pendingStreamingSnapshot after applying", () => {
      expect(fnMatch![0]).toContain(
        "ChatState.pendingStreamingSnapshot = null",
      );
    });

    it("clears the safety timer after applying", () => {
      const applyBlock = fnMatch![0].match(
        /if \(ChatState\.pendingStreamingSnapshot\)[\s\S]*?applyStreamingSnapshot\(snapshot\);/,
      );
      expect(applyBlock).toBeTruthy();
      expect(applyBlock![0]).toContain(
        "clearTimeout(ChatState.streamingSnapshotTimer)",
      );
    });

    it("clears replayRequested (now gates request_state)", () => {
      expect(fnMatch![0]).toContain("ChatState.replayRequested = false");
    });

    it("applies snapshot before the editable-bubble heuristic", () => {
      const snapshotIdx = fnMatch![0].indexOf(
        "if (ChatState.pendingStreamingSnapshot)",
      );
      const bubbleIdx = fnMatch![0].indexOf(
        'if (lastRole !== "user" && !ChatState.streaming.reconstructed)',
      );
      expect(snapshotIdx).toBeGreaterThan(-1);
      expect(bubbleIdx).toBeGreaterThan(-1);
      expect(snapshotIdx).toBeLessThan(bubbleIdx);
    });
  });

  describe("Safety timeout applies snapshot when history never arrives", () => {
    const fnMatch = source.match(/function handleStreamingState[\s\S]*?^}/m);

    it("timer applies pendingStreamingSnapshot if historyLoaded still false", () => {
      const timerBlock = fnMatch![0].match(
        /setTimeout\(\(\) => \{[\s\S]*?\}, 2000\);/m,
      );
      expect(timerBlock).toBeTruthy();
      expect(timerBlock![0]).toContain("!ChatState.historyLoaded");
      expect(timerBlock![0]).toContain("ChatState.pendingStreamingSnapshot");
      expect(timerBlock![0]).toContain("applyStreamingSnapshot(snapshot)");
    });

    it("timer clears the streamingSnapshotTimer reference", () => {
      const timerBlock = fnMatch![0].match(
        /setTimeout\(\(\) => \{[\s\S]*?\}, 2000\);/m,
      );
      expect(timerBlock![0]).toContain(
        "ChatState.streamingSnapshotTimer = null",
      );
    });
  });

  describe("Recovery sends request_state instead of request_replay", () => {
    const fnMatch = source.match(
      /function shouldAcceptStreamingEvent[\s\S]*?^}/m,
    );

    it("sends request_state (not request_replay)", () => {
      expect(fnMatch![0]).toContain('type: "request_state"');
      expect(fnMatch![0]).not.toContain('type: "request_replay"');
    });

    it("uses replayRequested flag to prevent duplicate requests", () => {
      expect(fnMatch![0]).toContain("!ChatState.replayRequested");
      expect(fnMatch![0]).toContain("ChatState.replayRequested = true");
    });
  });

  describe("replayRequested flag cleared on snapshot apply", () => {
    const applyMatch = source.match(
      /function applyStreamingSnapshot[\s\S]*?^}/m,
    );

    it("applyStreamingSnapshot clears replayRequested when promptId is valid", () => {
      expect(applyMatch![0]).toContain("ChatState.replayRequested = false");
    });

    it("loadChatHistory clears replayRequested", () => {
      const loadMatch = source.match(
        /function loadChatHistory[\s\S]*?container\.innerHTML = ""[\s\S]*?ChatState\.replayRequested = false/m,
      );
      expect(loadMatch).toBeTruthy();
    });
  });

  describe("streaming_state dispatcher guard for non-active thread", () => {
    it("drops streaming_state when chatThreadId does not match activeThreadId", () => {
      const caseMatch = source.match(
        /case "streaming_state":[\s\S]*?handleStreamingState\(data\);/,
      );
      expect(caseMatch).toBeTruthy();
      expect(caseMatch![0]).toContain("data.chatThreadId !== activeThreadId");
    });
  });
});
