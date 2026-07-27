import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("Streaming promptId recovery", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "..", "..", "public", "js", "chat.js"),
    "utf-8",
  );

  describe("handleStreamingState restores currentPromptId", () => {
    it("extracts promptId from streaming_state data", () => {
      expect(source).toContain(
        "const { thoughtContent, messageContent, promptId } = data;",
      );
    });

    it("sets currentPromptId when promptId is a valid string", () => {
      const fnMatch = source.match(
        /function applyStreamingSnapshot[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("ChatState.currentPromptId = promptId");
    });

    it("clears replayRequested when restoring promptId", () => {
      const fnMatch = source.match(
        /function applyStreamingSnapshot[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("ChatState.replayRequested = false");
    });
  });

  describe("shouldAcceptStreamingEvent logs rejection", () => {
    it("logs console.warn when currentPromptId is null", () => {
      expect(source).toContain(
        "[stream-protocol] ${eventType} rejected: currentPromptId is null",
      );
    });

    it("logs console.warn when promptId mismatches", () => {
      expect(source).toContain(
        "[stream-protocol] ${eventType} promptId mismatch:",
      );
    });
  });

  describe("shouldAcceptStreamingEvent requests state when currentPromptId is null", () => {
    it("sends request_state when streaming is active and promptId is null", () => {
      const fnMatch = source.match(
        /function shouldAcceptStreamingEvent[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain('type: "request_state"');
      expect(fnBody).toContain("ChatState.replayRequested = true");
    });

    it("guards against duplicate state requests", () => {
      const fnMatch = source.match(
        /function shouldAcceptStreamingEvent[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("!ChatState.replayRequested");
    });
  });

  describe("shouldAcceptStreamingEvent updates mismatched promptId", () => {
    it("accepts event when promptId is valid but mismatched", () => {
      const fnMatch = source.match(
        /function shouldAcceptStreamingEvent[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("ChatState.currentPromptId = eventPromptId");
    });

    it("returns true after updating mismatched promptId", () => {
      const fnMatch = source.match(
        /function shouldAcceptStreamingEvent[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      const updateBlock = fnBody.match(
        /typeof eventPromptId === "string"[\s\S]*?return true;/,
      );
      expect(updateBlock).toBeTruthy();
    });
  });

  describe("replayRequested flag lifecycle", () => {
    it("is defined in ChatState", () => {
      expect(source).toContain("replayRequested: false");
    });

    it("is cleared in loadChatHistory", () => {
      const fnMatch = source.match(
        /function loadChatHistory[\s\S]*?container\.innerHTML = ""[\s\S]*?ChatState\.replayRequested = false/m,
      );
      expect(fnMatch).toBeTruthy();
    });
  });

  describe("shouldAcceptStreamingEvent recovers when currentPromptId is null but eventPromptId is valid", () => {
    it("accepts the event and adopts eventPromptId as currentPromptId", () => {
      const fnMatch = source.match(
        /function shouldAcceptStreamingEvent[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];

      // The recovery branch must run BEFORE the early `return false` that
      // drops events when currentPromptId is null. Match the null-current
      // guard block up to the recovery that adopts eventPromptId.
      const nullBlock = fnBody.match(
        /if \(!ChatState\.currentPromptId\) \{[\s\S]*?\n  \}/,
      );
      expect(nullBlock).toBeTruthy();

      // Within the null-current guard, when eventPromptId is a valid string
      // the function should adopt it and return true (recovering the stream)
      // rather than unconditionally returning false.
      const nullGuard = nullBlock![0];
      const recovery = nullGuard.match(
        /typeof eventPromptId === "string" && eventPromptId\.length > 0[\s\S]*?ChatState\.currentPromptId = eventPromptId[\s\S]*?return true;/,
      );
      expect(recovery).toBeTruthy();
    });

    it("still requests state when eventPromptId is absent and streaming is active", () => {
      const fnMatch = source.match(
        /function shouldAcceptStreamingEvent[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      const nullBlock = fnBody.match(
        /if \(!ChatState\.currentPromptId\) \{[\s\S]*?\n  \}/,
      );
      expect(nullBlock).toBeTruthy();
      const nullGuard = nullBlock![0];
      expect(nullGuard).toContain('type: "request_state"');
      expect(nullGuard).toContain("ChatState.replayRequested = true");
    });
  });
});
