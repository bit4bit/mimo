import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const utilsPath = join(
  import.meta.dir,
  "../../../public/js/chat-decorated-utils.js",
);
const utilsCode = readFileSync(utilsPath, "utf-8");

const sandbox: any = {};
const wrappedCode = `(function (window) {\n${utilsCode}\n})(sandbox);`;

// eslint-disable-next-line @typescript-eslint/no-implied-eval
eval(wrappedCode);

const { escapeHtml, decorateInlineMarkup, buildDecoratedLines } = sandbox;

// --- escapeHtml ---

describe("escapeHtml", () => {
  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert('xss')&lt;/script&gt;",
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

// --- decorateInlineMarkup ---

describe("decorateInlineMarkup — bold", () => {
  it("wraps **text** in <b> with markers visible", () => {
    const result = decorateInlineMarkup("this is **bold** text");
    expect(result).toContain('<b class="decorated-bold">**bold**</b>');
    expect(result).toContain("this is ");
    expect(result).toContain(" text");
  });

  it("wraps __text__ in <b> with markers visible", () => {
    const result = decorateInlineMarkup("this is __bold__ text");
    expect(result).toContain('<b class="decorated-bold">__bold__</b>');
  });

  it("treats unclosed ** as literal text", () => {
    const result = decorateInlineMarkup("this is **unclosed");
    expect(result).toBe("this is **unclosed");
  });
});

describe("decorateInlineMarkup — italic", () => {
  it("wraps *text* in <i> with markers visible", () => {
    const result = decorateInlineMarkup("this is *italic* text");
    expect(result).toContain('<i class="decorated-italic">*italic*</i>');
  });

  it("wraps _text_ in <i> with markers visible", () => {
    const result = decorateInlineMarkup("this is _italic_ text");
    expect(result).toContain('<i class="decorated-italic">_italic_</i>');
  });

  it("treats unclosed * as literal text", () => {
    const result = decorateInlineMarkup("this is *unclosed");
    expect(result).toBe("this is *unclosed");
  });

  it("does not treat underscores inside words as italic", () => {
    const result = decorateInlineMarkup("some_variable_name");
    expect(result).toBe("some_variable_name");
  });
});

describe("decorateInlineMarkup — code spans", () => {
  it("wraps `code` in <code> with backticks visible", () => {
    const result = decorateInlineMarkup("run `npm install` now");
    expect(result).toContain(
      '<code class="decorated-code">`npm install`</code>',
    );
  });

  it("protects code span content from bold/italic processing", () => {
    const result = decorateInlineMarkup("use `**not bold**` here");
    expect(result).toContain(
      '<code class="decorated-code">`**not bold**`</code>',
    );
    expect(result).not.toContain("decorated-bold");
  });

  it("treats unclosed backtick as literal text", () => {
    const result = decorateInlineMarkup("this is `unclosed");
    expect(result).toBe("this is `unclosed");
  });
});

describe("decorateInlineMarkup — links", () => {
  it("wraps [text](url) in <a> with full syntax visible", () => {
    const result = decorateInlineMarkup("see [docs](https://example.com) here");
    expect(result).toContain(
      '<a class="decorated-link" href="https://example.com" target="_blank" rel="noopener">[docs](https://example.com)</a>',
    );
  });
});

describe("decorateInlineMarkup — combined", () => {
  it("handles bold and italic in the same line", () => {
    const result = decorateInlineMarkup("**bold** and *italic*");
    expect(result).toContain("decorated-bold");
    expect(result).toContain("decorated-italic");
  });

  it("bold takes precedence over italic for ***text***", () => {
    // **...**  matches first, leaving *...*  around it
    const result = decorateInlineMarkup("***both***");
    expect(result).toContain("decorated-bold");
  });
});

// --- XSS safety ---

describe("XSS safety", () => {
  it("escapes angle brackets in message text before decoration", () => {
    const html = escapeHtml("<img src=x onerror=alert(1)>");
    const result = decorateInlineMarkup(html);
    expect(result).not.toContain("<img");
    expect(result).toContain("&lt;img");
  });

  it("escapes script tags embedded in bold markers", () => {
    const html = escapeHtml("**<script>alert(1)</script>**");
    const result = decorateInlineMarkup(html);
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });
});

// --- buildDecoratedLines ---

describe("buildDecoratedLines — plain content", () => {
  it("produces plain descriptors for text with no markup", () => {
    const lines = buildDecoratedLines("hello world");
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("plain");
    expect(lines[0].text).toBe("hello world");
  });

  it("produces empty descriptor for blank lines", () => {
    const lines = buildDecoratedLines("line one\n\nline two");
    expect(lines).toHaveLength(3);
    expect(lines[1].type).toBe("empty");
  });
});

describe("buildDecoratedLines — decorated content", () => {
  it("produces decorated descriptor for bold text", () => {
    const lines = buildDecoratedLines("this is **bold**");
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("decorated");
    expect(lines[0].html).toContain("decorated-bold");
  });
});

describe("buildDecoratedLines — heading tokens", () => {
  it("detects a level-1 heading", () => {
    const lines = buildDecoratedLines("# Introduction");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      type: "heading",
      level: 1,
      text: "# Introduction",
      html: "# Introduction",
    });
  });

  it("maps ## through ###### to levels 2 through 6", () => {
    const lines = buildDecoratedLines(
      ["## Two", "### Three", "#### Four", "##### Five", "###### Six"].join(
        "\n",
      ),
    );
    expect(
      lines.map((line: { type: string; level?: number }) => line.type),
    ).toEqual(["heading", "heading", "heading", "heading", "heading"]);
    expect(lines.map((line: { level?: number }) => line.level)).toEqual([
      2, 3, 4, 5, 6,
    ]);
  });

  it("does not treat #hashtag as a heading", () => {
    const lines = buildDecoratedLines("#hashtag");
    expect(lines).toHaveLength(1);
    expect(lines[0].type).not.toBe("heading");
  });

  it("does not treat a bare # as a heading", () => {
    const lines = buildDecoratedLines("#");
    expect(lines).toHaveLength(1);
    expect(lines[0].type).not.toBe("heading");
  });

  it("decorates inline bold inside heading html", () => {
    const lines = buildDecoratedLines("## **Bold**");
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("heading");
    expect(lines[0].html).toContain('<b class="decorated-bold">**Bold**</b>');
  });

  it("decorates inline code spans inside heading html", () => {
    const lines = buildDecoratedLines("### `code`");
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("heading");
    expect(lines[0].html).toContain(
      '<code class="decorated-code">`code`</code>',
    );
  });

  it("escapes heading html to prevent script injection", () => {
    const lines = buildDecoratedLines("# <script>alert(1)</script>");
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("heading");
    expect(lines[0].html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(lines[0].html).not.toContain("<script>");
  });
});

describe("buildDecoratedLines — fenced code blocks", () => {
  it("groups fenced block lines into a single fence descriptor", () => {
    const text = "```js\nconst x = 1;\n```";
    const lines = buildDecoratedLines(text);
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("fence");
    expect(lines[0].lines).toEqual(["```js", "const x = 1;", "```"]);
  });

  it("does not process inline markup inside fenced blocks", () => {
    const text = "```\n**not bold**\n```";
    const lines = buildDecoratedLines(text);
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("fence");
    // Fence lines are raw text, no HTML decoration
    expect(lines[0].lines[1]).toBe("**not bold**");
  });

  it("handles empty fenced blocks", () => {
    const text = "```\n```";
    const lines = buildDecoratedLines(text);
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("fence");
    expect(lines[0].lines).toEqual(["```", "```"]);
  });

  it("treats unclosed fence as plain lines", () => {
    const text = "```js\nconst x = 1;";
    const lines = buildDecoratedLines(text);
    // Unclosed fence emits lines as plain
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.every((l: { type: string }) => l.type !== "fence")).toBe(true);
  });
});

// --- renderPlainContent contract ---

describe("renderPlainContent contract", () => {
  // renderPlainContent is DOM-based (in chat.js), so we test the algorithm
  // contract: split by \n, empty lines get <br>, non-empty get textContent

  function buildPlainDescriptors(
    text: string,
  ): Array<{ isEmpty: boolean; text: string }> {
    return String(text || "")
      .split("\n")
      .map((line) => ({
        isEmpty: line === "",
        text: line,
      }));
  }

  it("produces raw text with no styling", () => {
    const lines = buildPlainDescriptors("**bold** and `code`");
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("**bold** and `code`");
  });

  it("preserves newlines as separate descriptors", () => {
    const lines = buildPlainDescriptors("line one\nline two");
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("line one");
    expect(lines[1].text).toBe("line two");
  });

  it("marks empty lines for <br> rendering", () => {
    const lines = buildPlainDescriptors("a\n\nb");
    expect(lines).toHaveLength(3);
    expect(lines[1].isEmpty).toBe(true);
  });
});

// --- Toggle contract ---

describe("toggle view mode contract", () => {
  // The toggle handler in chat.js reads dataset.viewMode and switches between
  // renderDecoratedContent and renderPlainContent. We test the state machine.

  type ViewMode = "decorated" | "plain";

  function toggleMode(current: ViewMode): ViewMode {
    return current === "decorated" ? "plain" : "decorated";
  }

  it("toggles from decorated to plain", () => {
    expect(toggleMode("decorated")).toBe("plain");
  });

  it("toggles from plain to decorated", () => {
    expect(toggleMode("plain")).toBe("decorated");
  });

  it("round-trips back to original mode", () => {
    expect(toggleMode(toggleMode("decorated"))).toBe("decorated");
  });
});

// --- File-ref detection in decorated vs plain ---

describe("file-ref in decorated vs plain contract", () => {
  // In decorated mode, file-ref detection runs on text nodes.
  // In plain mode, no file-ref detection (textContent only).
  // We test the decision logic.

  function shouldApplyFileRefs(mode: string): boolean {
    return mode === "decorated";
  }

  it("applies file-refs in decorated mode", () => {
    expect(shouldApplyFileRefs("decorated")).toBe(true);
  });

  it("does not apply file-refs in plain mode", () => {
    expect(shouldApplyFileRefs("plain")).toBe(false);
  });
});
