import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const expertUtilsPath = join(import.meta.dir, "../public/js/expert-utils.js");
const expertUtilsCode = readFileSync(expertUtilsPath, "utf-8");

const sandbox: any = {};
const wrappedCode = expertUtilsCode
  .replace(/\(function \(\) \{/, "(function (window, module) {")
  .replace(/\}\)\(\);/, "})(sandbox, { exports: {} });");

// eslint-disable-next-line @typescript-eslint/no-implied-eval
eval(wrappedCode);

const {
  extractReplacement,
  extractSearchReplaceBlocks,
  applySearchReplaceBlock,
  applySearchReplaceBlocks,
  applyReplacements,
} = sandbox.MIMO_EXPERT_UTILS;

describe("Expert Utils - SEARCH/REPLACE", () => {
  it("parses a single block", () => {
    const blocks = extractSearchReplaceBlocks(`
before
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE
after
`);
    expect(blocks).toEqual([{ search: "old", replace: "new" }]);
  });

  it("parses multiple blocks in order", () => {
    const blocks = extractSearchReplaceBlocks(`
<<<<<<< SEARCH
a
=======
A
>>>>>>> REPLACE
<<<<<<< SEARCH
b
=======
B
>>>>>>> REPLACE
`);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].search).toBe("a");
    expect(blocks[1].replace).toBe("B");
  });

  it("returns empty array when no blocks are present", () => {
    expect(extractSearchReplaceBlocks("plain text")).toEqual([]);
  });

  it("detects replacement payload in extractReplacement", () => {
    const parsed = extractReplacement(`
<<<<<<< SEARCH
x
=======
y
>>>>>>> REPLACE
`);
    expect(parsed.format).toBe("search_replace");
    expect(parsed.blocks).toHaveLength(1);
  });

  it("extracts out-of-scope error payload", () => {
    const parsed = extractReplacement(
      '{"file":"x.ts","error":"OUT_OF_SCOPE_CHANGE_REQUIRED"}',
    );
    expect(parsed).toEqual({ error: "OUT_OF_SCOPE_CHANGE_REQUIRED" });
  });

  it("returns null for unsupported payloads", () => {
    expect(extractReplacement('{"replacements":[]}')).toBeNull();
  });

  it("applies exact match", () => {
    const result = applySearchReplaceBlock("a\nold\nb", {
      search: "old",
      replace: "new",
    });
    expect(result).toBe("a\nnew\nb");
  });

  it("applies whitespace-normalized match with indentation adaptation", () => {
    const result = applySearchReplaceBlock("a\n  old()\n    pass\nb", {
      search: "    old()\n        pass",
      replace: "    newer()\n        return 42",
    });
    expect(result).toContain("  newer()");
    expect(result).toContain("    return 42");
  });

  it("applies insertion via anchor pattern", () => {
    const result = applySearchReplaceBlock("top\nanchor\nbot", {
      search: "anchor",
      replace: "anchor\ninserted",
    });
    expect(result).toBe("top\nanchor\ninserted\nbot");
  });

  it("applies deletion via empty replace", () => {
    const result = applySearchReplaceBlock("top\nremove\nbot", {
      search: "remove",
      replace: "",
    });
    expect(result).toBe("top\n\nbot");
  });

  it("applies multiple blocks sequentially", () => {
    const result = applySearchReplaceBlocks("a\none\nb\ntwo\nc", [
      { search: "one", replace: "ONE" },
      { search: "two", replace: "TWO" },
    ]);
    expect(result).toBe("a\nONE\nb\nTWO\nc");
  });

  it("fails with block number context", () => {
    expect(() =>
      applySearchReplaceBlocks("a\none\nb", [
        { search: "one", replace: "ONE" },
        { search: "missing", replace: "x" },
      ]),
    ).toThrow("Block 2");
  });

  it("throws not-found error", () => {
    expect(() =>
      applySearchReplaceBlock("a\nb", { search: "x", replace: "y" }),
    ).toThrow("Could not find the code to replace");
  });

  it("throws ambiguous-match error", () => {
    expect(() =>
      applySearchReplaceBlock("dup\nmid\ndup", { search: "dup", replace: "x" }),
    ).toThrow("Multiple matches found");
  });

  it("throws empty-search error", () => {
    expect(() =>
      applySearchReplaceBlock("abc", { search: "   ", replace: "x" }),
    ).toThrow("Empty search block");
  });

  it("applyReplacements supports search_replace payload", () => {
    const result = applyReplacements("old", {
      format: "search_replace",
      blocks: [{ search: "old", replace: "new" }],
    });
    expect(result).toBe("new");
  });

  it("applyReplacements rejects unsupported format", () => {
    expect(() =>
      applyReplacements("old", {
        format: "json",
        replacements: [],
      }),
    ).toThrow("Unsupported replacement format");
  });
});
