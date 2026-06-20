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
      const fnMatch = source.match(/function handleStreamingState[\s\S]*?^}/m);
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("ChatState.currentPromptId = promptId");
    });

    it("clears replayRequested when restoring promptId", () => {
      const fnMatch = source.match(/function handleStreamingState[\s\S]*?^}/m);
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

  describe("shouldAcceptStreamingEvent requests replay when currentPromptId is null", () => {
    it("sends request_replay when streaming is active and promptId is null", () => {
      const fnMatch = source.match(
        /function shouldAcceptStreamingEvent[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain('type: "request_replay"');
      expect(fnBody).toContain("ChatState.replayRequested = true");
    });

    it("guards against duplicate replay requests", () => {
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
});
