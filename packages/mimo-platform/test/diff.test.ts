// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";

const MIMO_DIFF = require("../public/js/diff.js");

describe("computeDiff", () => {
  it("returns identical panes when content is the same", () => {
    const original = "line1\nline2\nline3";
    const result = MIMO_DIFF.computeDiff(original, original);

    expect(result.original.lines).toHaveLength(3);
    expect(result.modified.lines).toHaveLength(3);

    result.original.lines.forEach((line) => {
      expect(line.type).toBe("unchanged");
    });
    result.modified.lines.forEach((line) => {
      expect(line.type).toBe("unchanged");
    });
  });

  it("marks added lines green in modified pane", () => {
    const original = "line1\nline2";
    const modified = "line1\nline2\nline3";

    const result = MIMO_DIFF.computeDiff(original, modified);

    expect(result.original.lines).toHaveLength(2);
    expect(result.modified.lines).toHaveLength(3);

    const addedLine = result.modified.lines.find((l) => l.type === "added");
    expect(addedLine).toBeDefined();
    expect(addedLine?.content).toBe("line3");
  });

  it("marks removed lines red in original pane", () => {
    const original = "line1\nline2\nline3";
    const modified = "line1\nline3";

    const result = MIMO_DIFF.computeDiff(original, modified);

    const removedLine = result.original.lines.find((l) => l.type === "removed");
    expect(removedLine).toBeDefined();
    expect(removedLine?.content).toBe("line2");
  });

  it("handles empty original (all added)", () => {
    const original = "";
    const modified = "line1\nline2";

    const result = MIMO_DIFF.computeDiff(original, modified);

    expect(result.original.lines).toHaveLength(0);
    expect(result.modified.lines).toHaveLength(2);
    result.modified.lines.forEach((line) => {
      expect(line.type).toBe("added");
    });
  });

  it("handles empty modified (all removed)", () => {
    const original = "line1\nline2";
    const modified = "";

    const result = MIMO_DIFF.computeDiff(original, modified);

    expect(result.original.lines).toHaveLength(2);
    expect(result.modified.lines).toHaveLength(0);
    result.original.lines.forEach((line) => {
      expect(line.type).toBe("removed");
    });
  });

  it("preserves line numbers in both panes", () => {
    const original = "line1\nline2\nline3";
    const modified = "line1\nmodified\nline3";

    const result = MIMO_DIFF.computeDiff(original, modified);

    expect(result.original.lines[0].lineNumber).toBe(1);
    expect(result.original.lines[1].lineNumber).toBe(2);
    expect(result.original.lines[2].lineNumber).toBe(3);

    expect(result.modified.lines[0].lineNumber).toBe(1);
    expect(result.modified.lines[1].lineNumber).toBe(2);
    expect(result.modified.lines[2].lineNumber).toBe(3);
  });

  it("returns DiffResult with original and modified panes", () => {
    const original = "a\nb";
    const modified = "a\nc";

    const result = MIMO_DIFF.computeDiff(original, modified);

    expect(result.original).toBeDefined();
    expect(result.original.lines).toBeDefined();
    expect(result.modified).toBeDefined();
    expect(result.modified.lines).toBeDefined();
  });

  it("represents full original content in original pane", () => {
    const original = "line1\nline2\nline3";
    const modified = "line1\nchanged\nline3";

    const result = MIMO_DIFF.computeDiff(original, modified);

    const allContent = result.original.lines.map((l) => l.content).join("\n");
    expect(allContent).toContain("line1");
    expect(allContent).toContain("line2");
    expect(allContent).toContain("line3");
  });

  it("represents full modified content in modified pane", () => {
    const original = "line1\nline2";
    const modified = "line1\nline2\nadded";

    const result = MIMO_DIFF.computeDiff(original, modified);

    const allContent = result.modified.lines
      .map((l: any) => l.content)
      .join("\n");
    expect(allContent).toContain("line1");
    expect(allContent).toContain("line2");
    expect(allContent).toContain("added");
  });

  it("marks unchanged lines correctly in modified pane when original has removed lines", () => {
    const original = "line1\nline2\nline3";
    const modified = "line1\nline3";

    const result = MIMO_DIFF.computeDiff(original, modified);

    const unchangedInModified = result.modified.lines.filter(
      (l: any) => l.type === "unchanged",
    );
    expect(unchangedInModified).toHaveLength(2);
    const contents = unchangedInModified.map((l: any) => l.content);
    expect(contents).toContain("line1");
    expect(contents).toContain("line3");
  });

  it("marks unchanged lines correctly in original pane when modified has added lines at start", () => {
    const original = "line2\nline3";
    const modified = "line1\nline2\nline3";

    const result = MIMO_DIFF.computeDiff(original, modified);

    const unchangedInOriginal = result.original.lines.filter(
      (l: any) => l.type === "unchanged",
    );
    expect(unchangedInOriginal).toHaveLength(2);
    const contents = unchangedInOriginal.map((l: any) => l.content);
    expect(contents).toContain("line2");
    expect(contents).toContain("line3");
  });
});
