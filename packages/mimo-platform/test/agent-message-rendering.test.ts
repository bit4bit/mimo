import { describe, it, expect } from "bun:test";

// renderTextAsLines algorithm contract:
// - Splits text by \n
// - Each line becomes a block element
// - Empty lines (where line === '') need a <br> child to preserve height
// - Non-empty lines get their text set directly (XSS-safe via textContent)
//
// This test file defines the behavior contract and tests the algorithm logic.
// The DOM implementation lives in chat.js's renderTextAsLines() function.

function buildLineDescriptors(text: string): Array<{ isEmpty: boolean; text: string }> {
  return text.split("\n").map((line) => ({
    isEmpty: line === "",
    text: line,
  }));
}

function copyTextFromLines(lines: Array<{ isEmpty: boolean; text: string }>): string {
  return lines.map((l) => l.text).join("\n");
}

describe("renderTextAsLines — line splitting", () => {
  it("single line produces one non-empty descriptor", () => {
    const lines = buildLineDescriptors("Hello world");
    expect(lines).toHaveLength(1);
    expect(lines[0].isEmpty).toBe(false);
    expect(lines[0].text).toBe("Hello world");
  });

  it("two lines separated by \\n produce two descriptors", () => {
    const lines = buildLineDescriptors("line one\nline two");
    expect(lines).toHaveLength(2);
    expect(lines[0].isEmpty).toBe(false);
    expect(lines[0].text).toBe("line one");
    expect(lines[1].isEmpty).toBe(false);
    expect(lines[1].text).toBe("line two");
  });

  it("empty line (\\n\\n) produces a descriptor with isEmpty = true", () => {
    const lines = buildLineDescriptors("paragraph one\n\nparagraph two");
    expect(lines).toHaveLength(3);
    expect(lines[0].isEmpty).toBe(false);
    expect(lines[1].isEmpty).toBe(true);
    expect(lines[1].text).toBe("");
    expect(lines[2].isEmpty).toBe(false);
  });

  it("multiple consecutive empty lines each produce an isEmpty descriptor", () => {
    const lines = buildLineDescriptors("a\n\n\nb");
    expect(lines).toHaveLength(4);
    expect(lines[1].isEmpty).toBe(true);
    expect(lines[2].isEmpty).toBe(true);
  });

  it("leading newline produces an empty descriptor at the start", () => {
    const lines = buildLineDescriptors("\nsome text");
    expect(lines).toHaveLength(2);
    expect(lines[0].isEmpty).toBe(true);
    expect(lines[1].text).toBe("some text");
  });

  it("trailing newline produces an empty descriptor at the end", () => {
    const lines = buildLineDescriptors("some text\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("some text");
    expect(lines[1].isEmpty).toBe(true);
  });

  it("empty string produces one empty descriptor", () => {
    const lines = buildLineDescriptors("");
    expect(lines).toHaveLength(1);
    expect(lines[0].isEmpty).toBe(true);
  });
});

describe("copy text extraction — joining lines with \\n", () => {
  it("single line round-trips correctly", () => {
    const text = "Hello world";
    const lines = buildLineDescriptors(text);
    expect(copyTextFromLines(lines)).toBe(text);
  });

  it("multi-line text round-trips correctly", () => {
    const text = "line one\nline two\nline three";
    const lines = buildLineDescriptors(text);
    expect(copyTextFromLines(lines)).toBe(text);
  });

  it("preserves empty lines on round-trip", () => {
    const text = "paragraph one\n\nparagraph two";
    const lines = buildLineDescriptors(text);
    expect(copyTextFromLines(lines)).toBe(text);
  });

  it("copy text does not include content from outside the response lines", () => {
    // Simulates extracting only message-response lines, not thought section text
    const messageText = "Step 1: do this\nStep 2: do that";
    const lines = buildLineDescriptors(messageText);
    const copied = copyTextFromLines(lines);
    expect(copied).toBe(messageText);
    expect(copied).not.toContain("thought");
  });
});
