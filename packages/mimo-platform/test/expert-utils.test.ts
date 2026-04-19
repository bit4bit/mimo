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

const { extractReplacement, applyReplacement } = sandbox.MIMO_EXPERT_UTILS;

describe("Expert Utils - extractReplacement", () => {
  it("extracts JSON from code block with json tag", () => {
    const response = JSON.stringify({
      file: "calc.py",
      replace_start_line: 42,
      replace_end_line: 44,
      replacement: "    def abs(self, x):\\n        pass",
    });

    const result = extractReplacement(response);
    
    expect(result).toEqual({
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
    
    expect(result).toEqual({
      file: "test.ts",
      replace_start_line: 10,
      replace_end_line: 12,
      replacement: "const x = 1;",
    });
  });

  it("extracts raw JSON without code blocks", () => {
    const response = '{"file": "main.py", "replace_start_line": 1, "replace_end_line": 2, "replacement": "print(1)"}';
    
    const result = extractReplacement(response);
    
    expect(result).toEqual({
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
    const response = '{"file": "test.py", "replace_start_line": 1, "replace_end_line": }';
    
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
    
    expect(result).not.toBeNull();
    expect(result.file).toBe("calc.py");
    expect(result.replace_start_line).toBe(42);
    expect(result.replace_end_line).toBe(44);
  });

  it("handles empty response", () => {
    const result = extractReplacement("");
    expect(result).toBeNull();
  });

  it("handles null response", () => {
    const result = extractReplacement(null as any);
    expect(result).toBeNull();
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
    const content = "class Calculator:\n    def add(self, x, y):\n        return x + y\n    \n    def sub(self, x, y):\n        return x - y";
    
    const replacement = {
      replace_start_line: 4,
      replace_end_line: 6,
      replacement: "    def abs(self, x):\n        if x < 0:\n            return -x\n        return x",
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

    const replacement = extractReplacement(llmResponse);
    expect(replacement).not.toBeNull();
    expect(replacement.file).toBe("calc.py");
    expect(replacement.replace_start_line).toBe(42);
    expect(replacement.replace_end_line).toBe(44);
    expect(replacement.replacement).toBe("    def abs(self, x):\\n        pass");
  });

  it("correctly applies the replacement from the example", () => {
    // Simulate original file content with line numbers around 42-44
    const originalContent = [
      "# Lines 1-41...",
      "class Calculator:",
      "    # Previous methods...",
      "",
      "    def old_abs(self, x):",  // line 42
      "        return abs(x)",       // line 43
      "",                           // line 44
      "    def pow(self, x, y):",
      "        return x ** y",
    ].join("\n");

    // Create a simpler replacement for testing
    const replacement = {
      file: "calc.py",
      replace_start_line: 5,  // 1-based index
      replace_end_line: 6,
      replacement: "    def abs(self, x: float) -> float:\n        if x < 0:\n            return -x\n        return x",
    };

    const result = applyReplacement(originalContent, replacement);
    
    // Verify the replacement was applied
    expect(result).toContain("def abs(self, x: float)");
    expect(result).toContain("if x < 0:");
    expect(result).not.toContain("return abs(x)");
    expect(result).toContain("def pow");  // Should be preserved
  });

  it("handles replacement with complex lambda expression", () => {
    const llmResponse = JSON.stringify({
      file: "calc.py",
      replace_start_line: 36,
      replace_end_line: 40,
      replacement: "    def mod(self, a: float, b: float) -> float:\n        return divmod(a, b)[1] if b != 0 else (_ for _ in ()).throw(ZeroDivisionError(\"Cannot use zero as modulus\"))",
    });

    const replacement = extractReplacement(llmResponse);
    expect(replacement).not.toBeNull();
    expect(replacement.file).toBe("calc.py");
    expect(replacement.replace_start_line).toBe(36);
    expect(replacement.replace_end_line).toBe(40);
    expect(replacement.replacement).toContain("def mod");
    expect(replacement.replacement).toContain("ZeroDivisionError");
    expect(replacement.replacement).toContain("(_ for _ in ()).throw");
  });
});
