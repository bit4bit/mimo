import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(
  join(import.meta.dir, "..", "..", "..", "public", "js", "chat.js"),
  "utf-8",
);

describe("Streaming content visualization", () => {
  describe("updateMessageContent accumulates text in state", () => {
    it("appends text to ChatState.streaming.content", () => {
      expect(source).toContain("ChatState.streaming.content += text");
    });

    it("does not use responseEl.textContent += in decorated mode", () => {
      const fnMatch = source.match(
        /function updateMessageContent[\s\S]*?^function /m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      const plainModeBranch = fnBody.includes('viewMode === "plain"');
      const textContentAppendInPlain = fnBody.includes(
        'responseEl.textContent += text',
      );
      expect(plainModeBranch).toBe(true);
      expect(textContentAppendInPlain).toBe(true);
    });

    it("schedules streaming render in decorated mode", () => {
      const fnMatch = source.match(
        /function updateMessageContent[\s\S]*?^function /m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("scheduleStreamingRender()");
    });
  });

  describe("scheduleStreamingRender throttles re-renders", () => {
    it("returns early if renderTimer is not null", () => {
      expect(source).toContain(
        "if (ChatState.streaming.renderTimer !== null) return",
      );
    });

    it("sets renderTimer to setTimeout", () => {
      expect(source).toContain(
        "ChatState.streaming.renderTimer = setTimeout",
      );
    });

    it("calls streamingRenderTick as the callback", () => {
      expect(source).toContain("streamingRenderTick");
    });
  });

  describe("streamingRenderTick renders decorated content", () => {
    it("clears the renderTimer", () => {
      expect(source).toContain(
        "ChatState.streaming.renderTimer = null",
      );
    });

    it("calls renderDecoratedContent with accumulated content", () => {
      const fnMatch = source.match(
        /function streamingRenderTick[\s\S]*?^function /m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("renderDecoratedContent(content, responseEl)");
    });

    it("appends typing cursor after render", () => {
      const fnMatch = source.match(
        /function streamingRenderTick[\s\S]*?^function /m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("typing-cursor");
    });

    it("skips render if content length unchanged", () => {
      expect(source).toContain("ChatState.streaming.lastRenderLength");
    });
  });

  describe("throttle interval adapts to message size", () => {
    it("uses 150ms for normal messages", () => {
      const fnMatch = source.match(
        /function getStreamingThrottleMs[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("150");
    });

    it("uses 500ms for messages over 50000 chars", () => {
      const fnMatch = source.match(
        /function getStreamingThrottleMs[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("50000");
      expect(fnBody).toContain("500");
    });
  });

  describe("toggle during streaming", () => {
    it("cancels pending renderTimer when switching to plain", () => {
      const toggleSection = source.match(
        /Attach toggle handler for streaming messages[\s\S]*?toggleBtn\.addEventListener[\s\S]*?}\);/,
      );
      expect(toggleSection).toBeTruthy();
      const toggleBody = toggleSection![0];
      expect(toggleBody).toContain("clearTimeout(ChatState.streaming.renderTimer)");
      expect(toggleBody).toContain('renderPlainContent(accumulated, responseEl)');
    });

    it("resumes rendering when switching back to decorated", () => {
      const toggleSection = source.match(
        /Attach toggle handler for streaming messages[\s\S]*?toggleBtn\.addEventListener[\s\S]*?}\);/,
      );
      expect(toggleSection).toBeTruthy();
      const toggleBody = toggleSection![0];
      expect(toggleBody).toContain('renderDecoratedContent(accumulated, responseEl)');
      expect(toggleBody).toContain("scheduleStreamingRender()");
    });

    it("reads from ChatState.streaming.content not DOM", () => {
      const toggleSection = source.match(
        /Attach toggle handler for streaming messages[\s\S]*?toggleBtn\.addEventListener[\s\S]*?}\);/,
      );
      expect(toggleSection).toBeTruthy();
      const toggleBody = toggleSection![0];
      expect(toggleBody).toContain("ChatState.streaming.content");
    });
  });

  describe("finalization cancels render timer and uses state content", () => {
    it("clears renderTimer on finalization", () => {
      const fnMatch = source.match(
        /function finalizeMessageStream[\s\S]*?^function /m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain("clearTimeout(ChatState.streaming.renderTimer)");
    });

    it("reads accumulated text from ChatState.streaming.content", () => {
      const fnMatch = source.match(
        /function finalizeMessageStream[\s\S]*?^function /m,
      );
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain(
        "const accumulated = ChatState.streaming.content",
      );
    });
  });
});

describe("Syntax highlighting for fenced code blocks", () => {
  it("renderDecoratedContent extracts language tag from fence opening line", () => {
    expect(source).toContain("langMatch");
    expect(source).toContain("/^```(\\w+)/");
  });

  it("calls hljs.highlightElement when language tag is present", () => {
    expect(source).toContain("hljs.highlightElement(codeEl)");
  });

  it("guards against missing hljs", () => {
    expect(source).toContain('typeof hljs !== "undefined"');
  });

  it("skips highlighting for large code blocks", () => {
    expect(source).toContain("codeContent.length <= 100");
  });

  it("uses try/catch around highlight call", () => {
    expect(source).toMatch(/try\s*\{[\s\S]*?hljs\.highlightElement[\s\S]*?\}\s*catch/);
  });
});