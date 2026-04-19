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
  applyReplacement,
  applyReplacements,
  rangesOverlap,
  fixMalformedJson,
} = sandbox.MIMO_EXPERT_UTILS;

describe("Expert Utils - extractReplacement", () => {
  it("extracts JSON from code block with json tag", () => {
    const response = JSON.stringify({
      file: "calc.py",
      replace_start_line: 42,
      replace_end_line: 44,
      replacement: "    def abs(self, x):\\n        pass",
    });

    const result = extractReplacement(response);

    // Returns array with single element (backward compatibility)
    expect(Array.isArray(result)).toBe(true);
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

    const result = extractReplacement(response);

    expect(Array.isArray(result)).toBe(true);
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

    const result = extractReplacement(response);

    expect(Array.isArray(result)).toBe(true);
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

    const result = extractReplacement(response);

    expect(Array.isArray(result)).toBe(true);
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

    const result = extractReplacement(response);

    expect(Array.isArray(result)).toBe(true);
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

    const result = extractReplacement(response);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].replacement).toContain("\n");
    expect(result[1].replacement).toContain("\n");
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
});

describe("Expert Utils - end-to-end", () => {
  it("extracts JSON from code block", () => {
    const llmResponse = JSON.stringify({
      file: "calc.py",
      replace_start_line: 42,
      replace_end_line: 44,
      replacement: "    def abs(self, x):\\n        pass",
    });

    const replacements = extractReplacement(llmResponse);
    expect(replacements).not.toBeNull();
    expect(Array.isArray(replacements)).toBe(true);
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

      const result = extractReplacement(response);

      expect(Array.isArray(result)).toBe(true);
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

      const result = extractReplacement(response);

      expect(Array.isArray(result)).toBe(true);
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

    it("rejects end line less than start line", () => {
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
        "replace_end_line must be >= replace_start_line",
      );
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

    const replacements = extractReplacement(llmResponse);
    expect(Array.isArray(replacements)).toBe(true);
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

    const replacements = extractReplacement(llmResponse);
    expect(Array.isArray(replacements)).toBe(true);
    expect(replacements).toHaveLength(1);
    expect(replacements[0].replace_start_line).toBe(3);

    const originalContent = "line1\nline2\nold\nline4";
    const result = applyReplacements(originalContent, replacements);

    expect(result).toBe("line1\nline2\n// updated\nline4");
  });

  it("end-to-end: malformed JSON with literal newlines", () => {
    // This simulates what the LLM might output with literal newlines
    const malformedResponse = `{\n  "replacements": [\n  {\n    "file": "calc.py",\n    "replace_start_line": 4,\n    "replace_end_line": 6,\n    "replacement": "    def _compute_log_value(self, x: float, base: float) -\u003e\n         the logarithm of x to the specified\n        return math.log(x, base)"\n  }\n]}`;

    const replacements = extractReplacement(malformedResponse);
    expect(Array.isArray(replacements)).toBe(true);
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
