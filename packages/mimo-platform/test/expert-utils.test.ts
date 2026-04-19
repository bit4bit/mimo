import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// Load the expert-utils module
const expertUtilsPath = join(import.meta.dir, "../public/js/expert-utils.js");
const expertUtilsCode = readFileSync(expertUtilsPath, "utf-8");

// Execute in a sandbox to get the exported functions
const sandbox: any = {};
const wrappedCode = expertUtilsCode
  .replace(/\(function \(\) \{/, "(function (window, module) {")
  .replace(/\}\)\(\);/, "})(sandbox, { exports: {} });");

// eslint-disable-next-line @typescript-eslint/no-implied-eval
eval(wrappedCode);

const {
  extractReplacement,
  extractSearchReplaceBlocks,
  applyReplacement,
  applySearchReplaceBlock,
  applySearchReplaceBlocks,
  applyReplacements,
  rangesOverlap,
  fixMalformedJson,
} = sandbox.MIMO_EXPERT_UTILS;

function expectJsonParsed(result: any) {
  expect(result).not.toBeNull();
  expect(result.format).toBe("json");
  expect(Array.isArray(result.replacements)).toBe(true);
  return result.replacements;
}

describe("Expert Utils - extractReplacement", () => {
  it("extracts JSON from code block with json tag", () => {
    const response = JSON.stringify({
      file: "calc.py",
      replace_start_line: 42,
      replace_end_line: 44,
      replacement: "    def abs(self, x):\\n        pass",
    });

    const parsed = extractReplacement(response);
    const result = expectJsonParsed(parsed);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      file: "calc.py",
      replace_start_line: 42,
      replace_end_line: 44,
      replacement: "    def abs(self, x):\\n        pass",
    });
  });

  it("extracts JSON from code block without json tag", () => {
    const response = JSON.stringify({
      file: "test.ts",
      replace_start_line: 10,
      replace_end_line: 12,
      replacement: "const x = 1;",
    });

    const parsed = extractReplacement(response);
    const result = expectJsonParsed(parsed);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      file: "test.ts",
      replace_start_line: 10,
      replace_end_line: 12,
      replacement: "const x = 1;",
    });
  });

  it("extracts raw JSON without code blocks", () => {
    const response =
      '{"file": "main.py", "replace_start_line": 1, "replace_end_line": 2, "replacement": "print(1)"}';

    const parsed = extractReplacement(response);
    const result = expectJsonParsed(parsed);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      file: "main.py",
      replace_start_line: 1,
      replace_end_line: 2,
      replacement: "print(1)",
    });
  });

  it("returns null for non-JSON response", () => {
    const response = "This is just a plain text response without JSON";

    const result = extractReplacement(response);

    expect(result).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const response =
      '{"file": "test.py", "replace_start_line": 1, "replace_end_line": }';

    const result = extractReplacement(response);

    expect(result).toBeNull();
  });

  it("handles JSON with multiline replacement", () => {
    const response = JSON.stringify({
      file: "calc.py",
      replace_start_line: 42,
      replace_end_line: 44,
      replacement: "def foo():\\n    pass",
    });

    const parsed = extractReplacement(response);
    const result = expectJsonParsed(parsed);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("calc.py");
    expect(result[0].replace_start_line).toBe(42);
    expect(result[0].replace_end_line).toBe(44);
  });

  it("handles empty response", () => {
    const result = extractReplacement("");
    expect(result).toBeNull();
  });

  it("handles null response", () => {
    const result = extractReplacement(null as any);
    expect(result).toBeNull();
  });

  it("handles malformed JSON with literal newlines in replacement strings", () => {
    const response =
      '{"replacements": [{"file": "calc.py", "replace_start_line": 11, "replace_end_line": 14, "replacement": "    def _compute_log_value(self, x: float, base: float) ->\n         the logarithm of x to the specified\n        return math.log(x, base)"}, {"file": "calc.py", "replace_start_line": 11, "replace_end_line": 11, "replacement": "    def log(self, x: float, base: float = math.e) ->\n         the logarithm of x to the specified\n        return self._compute_log_value(x, base)"}]}';

    const parsed = extractReplacement(response);
    const result = expectJsonParsed(parsed);
    expect(result).toHaveLength(2);
    expect(result[0].file).toBe("calc.py");
    expect(result[0].replace_start_line).toBe(11);
    expect(result[0].replace_end_line).toBe(14);
    expect(result[0].replacement).toContain("\n");
    expect(result[1].file).toBe("calc.py");
    expect(result[1].replace_start_line).toBe(11);
    expect(result[1].replace_end_line).toBe(11);
    expect(result[1].replacement).toContain("\n");
  });

  it("handles replacements array format with literal newlines", () => {
    const response = JSON.stringify({
      replacements: [
        {
          file: "test.ts",
          replace_start_line: 5,
          replace_end_line: 7,
          replacement: "line1\nline2\nline3",
        },
        {
          file: "test.ts",
          replace_start_line: 20,
          replace_end_line: 22,
          replacement: "// second\n// with newline",
        },
      ],
    });

    const parsed = extractReplacement(response);
    const result = expectJsonParsed(parsed);
    expect(result).toHaveLength(2);
    expect(result[0].replacement).toContain("\n");
    expect(result[1].replacement).toContain("\n");
  });
});

describe("Expert Utils - SEARCH/REPLACE", () => {
  it("T1 parses single block", () => {
    const response = `
before
<<<<<<< SEARCH
old_line
=======
new_line
>>>>>>> REPLACE
after`;

    const blocks = extractSearchReplaceBlocks(response);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ search: "old_line", replace: "new_line" });
  });

  it("T2 parses multiple blocks", () => {
    const response = `
<<<<<<< SEARCH
one
=======
ONE
>>>>>>> REPLACE
<<<<<<< SEARCH
two
=======
TWO
>>>>>>> REPLACE`;

    const blocks = extractSearchReplaceBlocks(response);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].search).toBe("two");
  });

  it("T3 parses blocks with surrounding text", () => {
    const response = "explain\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\nfinal";
    const blocks = extractSearchReplaceBlocks(response);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].search).toBe("a");
  });

  it("T4 returns empty when no block exists", () => {
    expect(extractSearchReplaceBlocks("no delimiters here")).toEqual([]);
  });

  it("T5 applies exact match", () => {
    const content = "line1\nold_line\nline3";
    const result = applySearchReplaceBlock(content, {
      search: "old_line",
      replace: "new_line",
    });
    expect(result).toBe("line1\nnew_line\nline3");
  });

  it("T6 applies whitespace-fuzzy match", () => {
    const content = "line1\n  def old():\n    pass\nline4";
    const result = applySearchReplaceBlock(content, {
      search: "    def old():\n        pass",
      replace: "    def new():\n        return 42",
    });
    expect(result).toContain("  def new():");
    expect(result).toContain("    return 42");
  });

  it("T7 applies insertion with anchor pattern", () => {
    const content = "a\nanchor\nb";
    const result = applySearchReplaceBlock(content, {
      search: "anchor",
      replace: "anchor\ninserted",
    });
    expect(result).toBe("a\nanchor\ninserted\nb");
  });

  it("T8 applies deletion with empty replace", () => {
    const content = "a\nremove\nb";
    const result = applySearchReplaceBlock(content, {
      search: "remove",
      replace: "",
    });
    expect(result).toBe("a\n\nb");
  });

  it("T9 applies multiple blocks sequentially", () => {
    const content = "a\nfirst\nmid\nsecond\nz";
    const result = applySearchReplaceBlocks(content, [
      { search: "first", replace: "FIRST" },
      { search: "second", replace: "SECOND" },
    ]);
    expect(result).toBe("a\nFIRST\nmid\nSECOND\nz");
  });

  it("T10 throws not found error", () => {
    expect(() =>
      applySearchReplaceBlock("a\nb", {
        search: "missing",
        replace: "x",
      }),
    ).toThrow("Could not find the code to replace");
  });

  it("T11 throws ambiguous match error", () => {
    expect(() =>
      applySearchReplaceBlock("dup\ncenter\ndup", {
        search: "dup",
        replace: "x",
      }),
    ).toThrow("Multiple matches found");
  });

  it("T12 throws empty search block error", () => {
    expect(() =>
      applySearchReplaceBlock("abc", {
        search: "   ",
        replace: "x",
      }),
    ).toThrow("Empty search block");
  });

  it("T13 keeps JSON format working", () => {
    const parsed = extractReplacement(
      '{"replacements":[{"file":"a.ts","replace_start_line":1,"replace_end_line":1,"replacement":"x"}]}',
    );
    const replacements = expectJsonParsed(parsed);
    const result = applyReplacements("old", { format: "json", replacements });
    expect(result).toBe("x");
  });

  it("T14 prefers SEARCH/REPLACE over JSON when both exist", () => {
    const parsed = extractReplacement(`
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE
{"replacements":[{"file":"a.ts","replace_start_line":1,"replace_end_line":1,"replacement":"json_new"}]}
`);
    expect(parsed.format).toBe("search_replace");
    const result = applyReplacements("old", parsed);
    expect(result).toBe("new");
  });

  it("T15 end-to-end replaces function body", () => {
    const content = "def old():\n    pass\n";
    const response = `
<<<<<<< SEARCH
def old():
    pass
=======
def old():
    \"\"\"Updated\"\"\"
    return 42
>>>>>>> REPLACE`;
    const parsed = extractReplacement(response);
    const result = applyReplacements(content, parsed);
    expect(result).toContain('"""Updated"""');
    expect(result).toContain("return 42");
  });

  it("T16 applies multiple independent edits from single response", () => {
    const content = "a\nold1\nb\nold2\nc";
    const response = `
<<<<<<< SEARCH
old1
=======
new1
>>>>>>> REPLACE
<<<<<<< SEARCH
old2
=======
new2
>>>>>>> REPLACE`;
    const parsed = extractReplacement(response);
    const result = applyReplacements(content, parsed);
    expect(result).toBe("a\nnew1\nb\nnew2\nc");
  });
});

describe("Expert Utils - fixMalformedJson", () => {
  it("escapes literal newlines inside JSON strings", () => {
    const input = '{"replacement": "line1\nline2"}';
    const fixed = fixMalformedJson(input);
    expect(fixed).toBe('{"replacement": "line1\\nline2"}');
  });

  it("escapes literal carriage returns inside JSON strings", () => {
    const input = '{"replacement": "line1\rline2"}';
    const fixed = fixMalformedJson(input);
    expect(fixed).toBe('{"replacement": "line1\\rline2"}');
  });

  it("preserves already-escaped newlines", () => {
    const input = '{"replacement": "line1\\nline2"}';
    const fixed = fixMalformedJson(input);
    expect(fixed).toBe('{"replacement": "line1\\nline2"}');
  });

  it("preserves newlines outside of strings", () => {
    const input = '{\n  "key": "value"\n}';
    const fixed = fixMalformedJson(input);
    expect(fixed).toBe('{\n  "key": "value"\n}');
  });

  it("handles escaped quotes correctly", () => {
    const input = '{"replacement": "say \\"hello\\""}';
    const fixed = fixMalformedJson(input);
    expect(fixed).toBe('{"replacement": "say \\"hello\\""}');
  });

  it("handles empty strings", () => {
    expect(fixMalformedJson("")).toBe("");
    expect(fixMalformedJson(null as any)).toBe(null);
    expect(fixMalformedJson(undefined as any)).toBe(undefined);
  });

  it("handles complex nested structure with newlines", () => {
    const input = `{
  "replacements": [
    {
      "file": "test.py",
      "replacement": "def foo():\n    pass"
    }
  ]
}`;
    const fixed = fixMalformedJson(input);
    expect(fixed).toContain('"replacement": "def foo():\\n    pass"');
    expect(fixed).not.toContain('"replacement": "def foo():\n    pass"');
  });

  it("handles multiple newlines in same string", () => {
    const input = '{"replacement": "line1\nline2\nline3"}';
    const fixed = fixMalformedJson(input);
    expect(fixed).toBe('{"replacement": "line1\\nline2\\nline3"}');
  });
});

describe("Expert Utils - applyReplacement", () => {
  it("replaces single line", () => {
    const content = "line1\nline2\nline3";
    const replacement = {
      replace_start_line: 2,
      replace_end_line: 2,
      replacement: "newLine2",
    };

    const result = applyReplacement(content, replacement);

    expect(result).toBe("line1\nnewLine2\nline3");
  });

  it("replaces multiple lines", () => {
    const content = "line1\nline2\nline3\nline4\nline5";
    const replacement = {
      replace_start_line: 2,
      replace_end_line: 4,
      replacement: "newLine2\nnewLine3",
    };

    const result = applyReplacement(content, replacement);

    expect(result).toBe("line1\nnewLine2\nnewLine3\nline5");
  });

  it("handles out of bounds start line", () => {
    const content = "line1\nline2";
    const replacement = {
      replace_start_line: 10,
      replace_end_line: 12,
      replacement: "newContent",
    };

    const result = applyReplacement(content, replacement);

    expect(result).toBe("line1\nline2");
  });

  it("handles invalid replacement object", () => {
    const content = "line1\nline2";
    const result = applyReplacement(content, null);
    expect(result).toBe("line1\nline2");
  });

  it("replaces last line", () => {
    const content = "line1\nline2\nline3";
    const replacement = {
      replace_start_line: 3,
      replace_end_line: 3,
      replacement: "lastLine",
    };

    const result = applyReplacement(content, replacement);

    expect(result).toBe("line1\nline2\nlastLine");
  });

  it("handles multiline replacement", () => {
    const content =
      "class Calculator:\n    def add(self, x, y):\n        return x + y\n    \n    def sub(self, x, y):\n        return x - y";

    const replacement = {
      replace_start_line: 4,
      replace_end_line: 6,
      replacement:
        "    def abs(self, x):\n        if x < 0:\n            return -x\n        return x",
    };

    const result = applyReplacement(content, replacement);

    expect(result).toContain("def abs");
    expect(result).toContain("return x + y"); // line 3 preserved
    expect(result).not.toContain("def sub"); // old lines 4-6 removed
  });

  it("inserts lines before a line (endLine = startLine - 1)", () => {
    const content = "line1\nline2\nline3";
    const replacement = {
      replace_start_line: 2,
      replace_end_line: 1,
      replacement: "insertedLine",
    };

    const result = applyReplacement(content, replacement);

    expect(result).toBe("line1\ninsertedLine\nline2\nline3");
  });

  it("inserts multiple lines before a line", () => {
    const content = "line1\nline2\nline3";
    const replacement = {
      replace_start_line: 2,
      replace_end_line: 1,
      replacement: "insertedA\ninsertedB",
    };

    const result = applyReplacement(content, replacement);

    expect(result).toBe("line1\ninsertedA\ninsertedB\nline2\nline3");
  });

  it("inserts at the beginning of file", () => {
    const content = "line1\nline2\nline3";
    const replacement = {
      replace_start_line: 1,
      replace_end_line: 0,
      replacement: "headerLine",
    };

    const result = applyReplacement(content, replacement);

    expect(result).toBe("headerLine\nline1\nline2\nline3");
  });

  it("appends at the end of file", () => {
    const content = "line1\nline2\nline3";
    const replacement = {
      replace_start_line: 4,
      replace_end_line: 3,
      replacement: "footerLine",
    };

    const result = applyReplacement(content, replacement);

    expect(result).toBe("line1\nline2\nline3\nfooterLine");
  });

  it("rejects invalid insertion (endLine < startLine - 1)", () => {
    const content = "line1\nline2\nline3";
    const replacement = {
      replace_start_line: 2,
      replace_end_line: 0,
      replacement: "bad",
    };

    const result = applyReplacement(content, replacement);

    // Should return original content unchanged
    expect(result).toBe("line1\nline2\nline3");
  });

  it("corrects line number using search text", () => {
    const content = "line1\nline2\nline3\nline4\nline5";
    // LLM thinks target is at line 2, but it's actually at line 4
    const replacement = {
      replace_start_line: 2,
      replace_end_line: 2,  // LLM intended to replace 1 line
      search: "line4",
      replacement: "replaced",
    };

    const result = applyReplacement(content, replacement);

    // Should find "line4" at line 4, preserve block size (1 line), replace line 4
    expect(result).toBe("line1\nline2\nline3\nreplaced\nline5");
  });

  it("search text with wrong line but correct content", () => {
    const content = "def old_func():\n    pass\n\ndef new_func():\n    pass";
    // LLM says line 4, but target is actually at line 1
    const replacement = {
      replace_start_line: 4,
      replace_end_line: 4,
      search: "def old_func():",
      replacement: "def updated_func():",
    };

    const result = applyReplacement(content, replacement);

    // Should find "def old_func():" at line 1, preserve block size (1 line)
    expect(result).toBe("def updated_func():\n    pass\n\ndef new_func():\n    pass");
  });

  it("falls back to original line when search not found", () => {
    const content = "line1\nline2\nline3";
    const replacement = {
      replace_start_line: 2,
      replace_end_line: 2,
      search: "nonexistent",
      replacement: "replaced",
    };

    const result = applyReplacement(content, replacement);

    // Search not found, falls back to line 2
    expect(result).toBe("line1\nreplaced\nline3");
  });

  it("works without search field (backward compatible)", () => {
    const content = "line1\nline2\nline3";
    const replacement = {
      replace_start_line: 2,
      replace_end_line: 2,
      replacement: "replaced",
    };

    const result = applyReplacement(content, replacement);

    expect(result).toBe("line1\nreplaced\nline3");
  });
});

describe("Expert Utils - end-to-end", () => {
  it("extracts JSON from code block", () => {
    const llmResponse = JSON.stringify({
      file: "calc.py",
      replace_start_line: 42,
      replace_end_line: 44,
      replacement: "    def abs(self, x):\\n        pass",
    });

    const parsed = extractReplacement(llmResponse);
    const replacements = expectJsonParsed(parsed);
    expect(replacements).toHaveLength(1);
    expect(replacements[0].file).toBe("calc.py");
    expect(replacements[0].replace_start_line).toBe(42);
    expect(replacements[0].replace_end_line).toBe(44);
    expect(replacements[0].replacement).toBe(
      "    def abs(self, x):\\n        pass",
    );
  });

  it("correctly applies the replacement from the example", () => {
    // Simulate original file content with line numbers around 42-44
    const originalContent = [
      "# Lines 1-41...",
      "class Calculator:",
      "    # Previous methods...",
      "",
      "    def old_abs(self, x):", // line 42
      "        return abs(x)", // line 43
      "", // line 44
      "    def pow(self, x, y):",
      "        return x ** y",
    ].join("\n");

    // Create a simpler replacement for testing
    const replacement = {
      file: "calc.py",
      replace_start_line: 5, // 1-based index
      replace_end_line: 6,
      replacement:
        "    def abs(self, x: float) -> float:\n        if x < 0:\n            return -x\n        return x",
    };

    const result = applyReplacement(originalContent, replacement);

    // Verify the replacement was applied
    expect(result).toContain("def abs(self, x: float)");
    expect(result).toContain("if x < 0:");
    expect(result).not.toContain("return abs(x)");
    expect(result).toContain("def pow"); // Should be preserved
  });
});

describe("Expert Utils - Multiple Replacements", () => {
  describe("extractReplacement with array format", () => {
    it("parses replacements array format", () => {
      const response = JSON.stringify({
        replacements: [
          {
            file: "test.ts",
            replace_start_line: 5,
            replace_end_line: 7,
            replacement: "// first",
          },
          {
            file: "test.ts",
            replace_start_line: 20,
            replace_end_line: 22,
            replacement: "// second",
          },
        ],
      });

      const parsed = extractReplacement(response);
      const result = expectJsonParsed(parsed);
      expect(result).toHaveLength(2);
      expect(result[0].replace_start_line).toBe(5);
      expect(result[1].replace_start_line).toBe(20);
    });

    it("parses single-element replacements array", () => {
      const response = JSON.stringify({
        replacements: [
          {
            file: "test.ts",
            replace_start_line: 10,
            replace_end_line: 12,
            replacement: "// single",
          },
        ],
      });

      const parsed = extractReplacement(response);
      const result = expectJsonParsed(parsed);
      expect(result).toHaveLength(1);
      expect(result[0].replace_start_line).toBe(10);
    });

    it("handles error response in object form", () => {
      const response = JSON.stringify({
        file: "test.ts",
        error: "OUT_OF_SCOPE_CHANGE_REQUIRED",
      });

      const result = extractReplacement(response);
      expect(result.error).toBe("OUT_OF_SCOPE_CHANGE_REQUIRED");
    });
  });

  describe("applyReplacements", () => {
    it("applies single replacement via array", () => {
      const content = "line1\nline2\nline3";
      const replacements = [
        {
          file: "test.ts",
          replace_start_line: 2,
          replace_end_line: 2,
          replacement: "newLine2",
        },
      ];

      const result = applyReplacements(content, replacements);

      expect(result).toBe("line1\nnewLine2\nline3");
    });

    it("applies multiple non-overlapping replacements", () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      const replacements = [
        {
          file: "test.ts",
          replace_start_line: 2,
          replace_end_line: 2,
          replacement: "newLine2",
        },
        {
          file: "test.ts",
          replace_start_line: 4,
          replace_end_line: 4,
          replacement: "newLine4",
        },
      ];

      const result = applyReplacements(content, replacements);

      expect(result).toBe("line1\nnewLine2\nline3\nnewLine4\nline5");
    });

    it("applies replacements in correct order (bottom-to-top)", () => {
      // Higher line numbers should be applied first to avoid shifting issues
      const content = "line1\nline2\nline3\nline4\nline5";
      const replacements = [
        {
          file: "test.ts",
          replace_start_line: 2,
          replace_end_line: 2,
          replacement: "A",
        },
        {
          file: "test.ts",
          replace_start_line: 4,
          replace_end_line: 4,
          replacement: "B",
        },
      ];

      const result = applyReplacements(content, replacements);

      expect(result).toBe("line1\nA\nline3\nB\nline5");
    });

    it("rejects overlapping replacement ranges", () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      const replacements = [
        {
          file: "test.ts",
          replace_start_line: 2,
          replace_end_line: 3,
          replacement: "A",
        },
        {
          file: "test.ts",
          replace_start_line: 3,
          replace_end_line: 4,
          replacement: "B",
        },
      ];

      expect(() => applyReplacements(content, replacements)).toThrow(
        "Replacements have overlapping line ranges",
      );
    });

    it("allows adjacent replacement ranges", () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      const replacements = [
        {
          file: "test.ts",
          replace_start_line: 2,
          replace_end_line: 2,
          replacement: "A",
        },
        {
          file: "test.ts",
          replace_start_line: 3,
          replace_end_line: 3,
          replacement: "B",
        },
      ];

      const result = applyReplacements(content, replacements);

      expect(result).toBe("line1\nA\nB\nline4\nline5");
    });

    it("handles empty replacements array", () => {
      const content = "line1\nline2";
      const replacements: any[] = [];

      expect(() => applyReplacements(content, replacements)).toThrow(
        "No replacements provided",
      );
    });

    it("rejects missing required fields", () => {
      const content = "line1\nline2";
      const replacements = [
        { file: "test.ts", replace_end_line: 2, replacement: "new" }, // missing replace_start_line
      ];

      expect(() => applyReplacements(content, replacements)).toThrow(
        "missing replace_start_line",
      );
    });

    it("rejects invalid line number (less than 1)", () => {
      const content = "line1\nline2";
      const replacements = [
        {
          file: "test.ts",
          replace_start_line: 0,
          replace_end_line: 1,
          replacement: "new",
        },
      ];

      expect(() => applyReplacements(content, replacements)).toThrow(
        "replace_start_line must be >= 1",
      );
    });

    it("rejects end line less than start line - 1", () => {
      const content = "line1\nline2";
      const replacements = [
        {
          file: "test.ts",
          replace_start_line: 5,
          replace_end_line: 3,
          replacement: "new",
        },
      ];

      expect(() => applyReplacements(content, replacements)).toThrow(
        "replace_end_line must be >= replace_start_line - 1",
      );
    });

    it("allows insertion range (end line = start line - 1)", () => {
      const content = "line1\nline2\nline3";
      const replacements = [
        {
          file: "test.ts",
          replace_start_line: 2,
          replace_end_line: 1,
          replacement: "inserted",
        },
      ];

      const result = applyReplacements(content, replacements);
      expect(result).toBe("line1\ninserted\nline2\nline3");
    });

    it("rejects non-array replacements", () => {
      const content = "line1\nline2";

      expect(() => applyReplacements(content, "not an array" as any)).toThrow(
        "Replacements must be an array",
      );
    });
  });

  describe("rangesOverlap", () => {
    it("detects overlapping ranges", () => {
      const a = { replace_start_line: 5, replace_end_line: 10 };
      const b = { replace_start_line: 8, replace_end_line: 15 };

      expect(rangesOverlap(a, b)).toBe(true);
      expect(rangesOverlap(b, a)).toBe(true);
    });

    it("allows adjacent ranges", () => {
      const a = { replace_start_line: 5, replace_end_line: 10 };
      const b = { replace_start_line: 11, replace_end_line: 15 };

      expect(rangesOverlap(a, b)).toBe(false);
      expect(rangesOverlap(b, a)).toBe(false);
    });

    it("detects identical ranges", () => {
      const a = { replace_start_line: 5, replace_end_line: 10 };
      const b = { replace_start_line: 5, replace_end_line: 10 };

      expect(rangesOverlap(a, b)).toBe(true);
    });

    it("detects nested ranges", () => {
      const a = { replace_start_line: 5, replace_end_line: 15 };
      const b = { replace_start_line: 8, replace_end_line: 12 };

      expect(rangesOverlap(a, b)).toBe(true);
      expect(rangesOverlap(b, a)).toBe(true);
    });

    it("insertion ranges do not overlap with anything", () => {
      const insertion = { replace_start_line: 5, replace_end_line: 4 };
      const replacement = { replace_start_line: 3, replace_end_line: 6 };

      expect(rangesOverlap(insertion, replacement)).toBe(false);
      expect(rangesOverlap(replacement, insertion)).toBe(false);
    });
  });
});

describe("Expert Utils - end-to-end with multiple replacements", () => {
  it("end-to-end: multiple replacements", () => {
    const llmResponse = JSON.stringify({
      replacements: [
        {
          file: "utils.ts",
          replace_start_line: 2,
          replace_end_line: 2,
          replacement: "const x = 1;",
        },
        {
          file: "utils.ts",
          replace_start_line: 5,
          replace_end_line: 5,
          replacement: "const y = 2;",
        },
      ],
    });

    const parsed = extractReplacement(llmResponse);
    const replacements = expectJsonParsed(parsed);
    expect(replacements).toHaveLength(2);

    const originalContent = "line1\nold2\nline3\nline4\nold5";
    const result = applyReplacements(originalContent, replacements);

    expect(result).toBe("line1\nconst x = 1;\nline3\nline4\nconst y = 2;");
  });

  it("end-to-end: backward compatibility with single object", () => {
    const llmResponse = JSON.stringify({
      file: "utils.ts",
      replace_start_line: 3,
      replace_end_line: 3,
      replacement: "// updated",
    });

    const parsed = extractReplacement(llmResponse);
    const replacements = expectJsonParsed(parsed);
    expect(replacements).toHaveLength(1);
    expect(replacements[0].replace_start_line).toBe(3);

    const originalContent = "line1\nline2\nold\nline4";
    const result = applyReplacements(originalContent, replacements);

    expect(result).toBe("line1\nline2\n// updated\nline4");
  });

  it("end-to-end: malformed JSON with literal newlines", () => {
    // This simulates what the LLM might output with literal newlines
    const malformedResponse = `{\n  "replacements": [\n  {\n    "file": "calc.py",\n    "replace_start_line": 4,\n    "replace_end_line": 6,\n    "replacement": "    def _compute_log_value(self, x: float, base: float) -\u003e\n         the logarithm of x to the specified\n        return math.log(x, base)"\n  }\n]}`;

    const parsed = extractReplacement(malformedResponse);
    const replacements = expectJsonParsed(parsed);
    expect(replacements).toHaveLength(1);
    expect(replacements[0].file).toBe("calc.py");
    expect(replacements[0].replace_start_line).toBe(4);
    expect(replacements[0].replace_end_line).toBe(6);
    expect(replacements[0].replacement).toContain("\n");
    expect(replacements[0].replacement).toContain("the logarithm of x");

    // Verify it can be applied
    const originalContent = [
      "class Calculator:",
      "    pass",
      "",
      "    def old_method(self):",
      "        pass",
      "",
      "    def another(self):",
      "        pass",
    ].join("\n");

    const result = applyReplacements(originalContent, replacements);
    expect(result).toContain("def _compute_log_value");
    expect(result).not.toContain("def old_method");
  });
});
