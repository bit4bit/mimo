import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const utilsCode = readFileSync(
  join(import.meta.dir, "../../../public/js/content-finder-utils.js"),
  "utf-8",
);

const sandbox: any = {};
const wrappedCode = utilsCode
  .replace(/\(function \(\) \{/, "(function (window, module) {")
  .replace(/\}\)\(\);\s*$/, "})(sandbox, { exports: {} });");

// eslint-disable-next-line @typescript-eslint/no-implied-eval
eval(wrappedCode);

const {
  clampContextValue,
  buildSearchUrl,
  buildResultLines,
  renderResultHtml,
} = sandbox.MIMO_CONTENT_FINDER_UTILS;

const result = (overrides: Record<string, unknown> = {}) => ({
  path: "src/foo.ts",
  line: 42,
  column: 6,
  text: "const foo = 3;",
  matchStart: 6,
  matchEnd: 9,
  before: ["const a = 1;", "const b = 2;"],
  after: ["return a;"],
  ...overrides,
});

describe("Content finder - context values", () => {
  it("keeps values inside 0–10 and falls back on invalid input", () => {
    expect(clampContextValue("3")).toBe(3);
    expect(clampContextValue(0)).toBe(0);
    expect(clampContextValue("50")).toBe(10);
    expect(clampContextValue(-1)).toBe(0);
    expect(clampContextValue("")).toBe(2);
    expect(clampContextValue("abc")).toBe(2);
    expect(clampContextValue(undefined)).toBe(2);
  });

  it("builds the search url with before and after values", () => {
    expect(buildSearchUrl("s1", "foo bar", 1, 4)).toBe(
      "/sessions/s1/search?q=foo%20bar&before=1&after=4",
    );
  });
});

describe("Content finder - result lines", () => {
  it("lists context and match lines in file order with line numbers", () => {
    expect(buildResultLines(result())).toEqual([
      { lineNumber: 40, text: "const a = 1;", kind: "before" },
      { lineNumber: 41, text: "const b = 2;", kind: "before" },
      {
        lineNumber: 42,
        text: "const foo = 3;",
        kind: "match",
        matchStart: 6,
        matchEnd: 9,
      },
      { lineNumber: 43, text: "return a;", kind: "after" },
    ]);
  });

  it("converts ripgrep byte offsets to string positions for non-ASCII text", () => {
    const [match] = buildResultLines(
      result({
        text: "const café = foo;",
        matchStart: 14,
        matchEnd: 17,
        before: [],
        after: [],
      }),
    );

    expect(match.text.slice(match.matchStart, match.matchEnd)).toBe("foo");
  });

  it("drops the trailing newline older servers left on the match line", () => {
    const [match] = buildResultLines(
      result({ text: "const foo = 3;\n", before: [], after: [] }),
    );

    expect(match.text).toBe("const foo = 3;");
  });
});

describe("Content finder - rendering", () => {
  it("shows the path header, dims context rows and highlights the match", () => {
    const html = renderResultHtml(result(), false);

    expect(html).toContain("src/foo.ts:42");
    expect(html.match(/cf-line cf-context/g)).toHaveLength(3);
    expect(html.match(/cf-line cf-match/g)).toHaveLength(1);
    expect(html).toContain('const <mark class="cf-hit">foo</mark> = 3;');
    expect(html.indexOf(">40<")).toBeLessThan(html.indexOf(">43<"));
  });

  it("marks the active result", () => {
    expect(renderResultHtml(result(), true)).toContain("cf-result active");
    expect(renderResultHtml(result(), false)).not.toContain("active");
  });

  it("escapes file content instead of interpreting it as HTML", () => {
    const html = renderResultHtml(
      result({
        before: ["<script>alert(1)</script>"],
        text: "a < foo && b",
        matchStart: 4,
        matchEnd: 7,
      }),
      false,
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain(
      'a &lt; <mark class="cf-hit">foo</mark> &amp;&amp; b',
    );
  });
});
