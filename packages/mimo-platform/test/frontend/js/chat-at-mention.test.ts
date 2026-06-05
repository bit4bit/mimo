import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("Chat @ mention detection", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "..", "..", "public", "js", "chat.js"),
    "utf-8",
  );

  it("defines handleAtMentionKeydown function that detects @ key", () => {
    expect(source).toContain("function handleAtMentionKeydown(e, contentEl)");
    expect(source).toContain('e.key !== "@"');
  });

  it("prevents default on @ keypress to suppress character insertion", () => {
    // The function must call e.preventDefault() before opening file finder
    const fnMatch = source.match(/function handleAtMentionKeydown[\s\S]*?^}/m);
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch![0];
    expect(fnBody).toContain("e.preventDefault()");
  });

  it("saves cursor position before opening file finder", () => {
    expect(source).toContain("savedRange = sel.getRangeAt(0).cloneRange()");
  });

  it("opens file finder in mention mode with onSelect callback", () => {
    expect(source).toContain('window.openFileFinder("", {');
    expect(source).toContain('mode: "mention"');
    expect(source).toContain("onSelect: function (file)");
  });

  it("onSelect callback inserts @file.path via execCommand insertText", () => {
    expect(source).toContain(
      'document.execCommand("insertText", false, "@" + file.path)',
    );
  });

  it("wires handleAtMentionKeydown in insertEditableBubble keydown listener", () => {
    // Both insertEditableBubble and insertEditableBubbleWithContent should call it
    const matches = source.match(/handleAtMentionKeydown\(e, content\)/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
