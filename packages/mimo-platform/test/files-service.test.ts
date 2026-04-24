import { describe, it, expect } from "bun:test";
import {
  matchesPattern,
  findFiles,
  applyIgnorePatterns,
  loadIgnorePatterns,
} from "../src/files/service.js";
import { detectLanguage, escapeHtml } from "../src/files/syntax-highlighter.js";
import { createOS } from "../src/os/node-adapter.js";
import type { FileInfo } from "../src/files/types.js";

// --- matchesPattern ---

describe("matchesPattern", () => {
  it("returns true when pattern is empty", () => {
    expect(matchesPattern("src/foo.ts", "")).toBe(true);
  });

  it("returns true when filename contains pattern (case-insensitive)", () => {
    expect(matchesPattern("service.ts", "serv")).toBe(true);
    expect(matchesPattern("SERVICE.TS", "serv")).toBe(true);
  });

  it("returns false when filename does not contain pattern", () => {
    expect(matchesPattern("routes.ts", "model")).toBe(false);
  });
});

// --- findFiles ---

describe("findFiles", () => {
  const files: FileInfo[] = [
    { path: "src/service.ts", name: "service.ts", size: 100 },
    { path: "src/routes.ts", name: "routes.ts", size: 200 },
    { path: "test/service.test.ts", name: "service.test.ts", size: 50 },
  ];

  it("returns all files when pattern is empty", () => {
    expect(findFiles("", files)).toHaveLength(3);
  });

  it("filters files by name substring", () => {
    const result = findFiles("service", files);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.name)).toContain("service.ts");
    expect(result.map((f) => f.name)).toContain("service.test.ts");
  });

  it("prioritizes full path matches before filename-only matches", () => {
    const prioritized: FileInfo[] = [
      { path: "src/service.ts", name: "service.ts", size: 100 },
      { path: "src/domain/service/helper.ts", name: "helper.ts", size: 100 },
      { path: "docs/service-guide.md", name: "service-guide.md", size: 100 },
    ];

    const result = findFiles("src/service", prioritized);
    expect(result).toHaveLength(2);
    expect(result[0]?.path).toBe("src/service.ts");
    expect(result[1]?.path).toBe("docs/service-guide.md");
  });

  it("matches absolute path queries against relative file paths", () => {
    const result = findFiles("/workspace/project/src/routes.ts", files);
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("src/routes.ts");
  });

  it("matches dot-relative path queries", () => {
    const result = findFiles("./src/routes.ts", files);
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("src/routes.ts");
  });

  it("returns empty array when no files match", () => {
    expect(findFiles("nonexistent", files)).toHaveLength(0);
  });
});

// --- applyIgnorePatterns ---

describe("applyIgnorePatterns", () => {
  const files: FileInfo[] = [
    { path: "src/index.ts", name: "index.ts", size: 0 },
    { path: "dist/bundle.js", name: "bundle.js", size: 0 },
    { path: "node_modules/lodash/index.js", name: "index.js", size: 0 },
    { path: "src/generated/types.ts", name: "types.ts", size: 0 },
    { path: "debug.log", name: "debug.log", size: 0 },
    { path: "src/important.log", name: "important.log", size: 0 },
  ];

  it("returns all files when patterns is empty", () => {
    expect(applyIgnorePatterns(files, [])).toHaveLength(files.length);
  });

  it("excludes files matching a wildcard pattern on filename", () => {
    const result = applyIgnorePatterns(files, ["*.log"]);
    expect(result.map((f) => f.path)).not.toContain("debug.log");
    expect(result.map((f) => f.path)).not.toContain("src/important.log");
  });

  it("excludes files matching a path-anchored pattern", () => {
    const result = applyIgnorePatterns(files, ["dist/*"]);
    expect(result.map((f) => f.path)).not.toContain("dist/bundle.js");
    expect(result.map((f) => f.path)).toContain("src/index.ts");
  });

  it("excludes files matching a ** pattern", () => {
    const result = applyIgnorePatterns(files, ["node_modules/**"]);
    expect(result.map((f) => f.path)).not.toContain(
      "node_modules/lodash/index.js",
    );
  });

  it("re-includes files matching a negation pattern", () => {
    const result = applyIgnorePatterns(files, ["*.log", "!important.log"]);
    expect(result.map((f) => f.path)).not.toContain("debug.log");
    expect(result.map((f) => f.path)).toContain("src/important.log");
  });

  it("excludes all files under a trailing-slash directory pattern", () => {
    const result = applyIgnorePatterns(files, ["node_modules/"]);
    expect(result.map((f) => f.path)).not.toContain(
      "node_modules/lodash/index.js",
    );
    expect(result.map((f) => f.path)).toContain("src/index.ts");
  });

  it("excludes files matching path-anchored directory prefix", () => {
    const result = applyIgnorePatterns(files, ["src/generated/*"]);
    expect(result.map((f) => f.path)).not.toContain("src/generated/types.ts");
    expect(result.map((f) => f.path)).toContain("src/index.ts");
  });
});

// --- loadIgnorePatterns ---

describe("loadIgnorePatterns", () => {
  it("returns empty array when neither .gitignore nor .mimoignore exists", () => {
    const os = createOS({ ...process.env });
    expect(loadIgnorePatterns("/nonexistent/path/xyz123", os)).toEqual([
      ".mimo-patches/",
    ]);
  });

  it("reads patterns from a real .gitignore file", async () => {
    const { mkdtempSync, writeFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const dir = mkdtempSync(tmpdir() + "/mimo-test-");
    writeFileSync(dir + "/.gitignore", "# comment\n\n*.log\ndist/\n");
    const os = createOS({ ...process.env });
    const patterns = loadIgnorePatterns(dir, os);
    expect(patterns).toContain(".mimo-patches/");
    expect(patterns).toContain("*.log");
    expect(patterns).toContain("dist/");
  });

  it("combines patterns from both .gitignore and .mimoignore", async () => {
    const { mkdtempSync, writeFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const dir = mkdtempSync(tmpdir() + "/mimo-test-");
    writeFileSync(dir + "/.gitignore", "*.log\n");
    writeFileSync(dir + "/.mimoignore", "*.tmp\n");
    const os = createOS({ ...process.env });
    const patterns = loadIgnorePatterns(dir, os);
    expect(patterns).toContain("*.log");
    expect(patterns).toContain("*.tmp");
  });

  it("skips blank lines and comment lines", async () => {
    const { mkdtempSync, writeFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const dir = mkdtempSync(tmpdir() + "/mimo-test-");
    writeFileSync(dir + "/.mimoignore", "# ignored\n\n  \nbuild/\n");
    const os = createOS({ ...process.env });
    const patterns = loadIgnorePatterns(dir, os);
    expect(patterns).toContain(".mimo-patches/");
    expect(patterns).toContain("build/");
  });
});

// --- readFile path traversal ---

describe("createFileService readFile", () => {
  it("rejects path traversal outside workspace", async () => {
    const { createFileService } = await import("../src/files/service.js");
    const os = createOS({ ...process.env });
    const service = createFileService(os);
    await expect(
      service.readFile("/some/workspace", "../etc/passwd"),
    ).rejects.toThrow("Access denied");
  });
});

// --- detectLanguage ---

describe("detectLanguage", () => {
  it("detects TypeScript from .ts extension", () => {
    expect(detectLanguage("foo.ts")).toBe("typescript");
    expect(detectLanguage("foo.tsx")).toBe("typescript");
  });

  it("detects JavaScript from .js extension", () => {
    expect(detectLanguage("foo.js")).toBe("javascript");
    expect(detectLanguage("foo.jsx")).toBe("javascript");
  });

  it("detects Go from .go extension", () => {
    expect(detectLanguage("main.go")).toBe("go");
  });

  it("detects Elixir from .ex/.exs/.heex/.leex/.eex extensions", () => {
    expect(detectLanguage("foo.ex")).toBe("elixir");
    expect(detectLanguage("foo.exs")).toBe("elixir");
    expect(detectLanguage("foo.heex")).toBe("elixir");
    expect(detectLanguage("foo.leex")).toBe("elixir");
    expect(detectLanguage("foo.eex")).toBe("elixir");
  });

  it("falls back to plaintext for unknown extensions", () => {
    expect(detectLanguage("binary.xyz")).toBe("plaintext");
    expect(detectLanguage("noextension")).toBe("plaintext");
  });
});

// --- escapeHtml ---

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});
