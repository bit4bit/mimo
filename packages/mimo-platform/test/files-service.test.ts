import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { matchesPattern, findFiles, createFileService } from "../src/files/service.js";
import { detectLanguage, escapeHtml } from "../src/files/syntax-highlighter.js";
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

  it("returns empty array when no files match", () => {
    expect(findFiles("nonexistent", files)).toHaveLength(0);
  });
});

// --- createFileService ---

describe("createFileService", () => {
  let tmpDir: string;
  const service = createFileService();

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mimo-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists files in workspace", async () => {
    writeFileSync(join(tmpDir, "foo.ts"), "export const x = 1;");
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(join(tmpDir, "src", "bar.ts"), "export const y = 2;");

    const files = await service.listFiles(tmpDir);
    const names = files.map((f) => f.name);
    expect(names).toContain("foo.ts");
    expect(names).toContain("bar.ts");
  });

  it("skips dotfiles and dot-directories", async () => {
    writeFileSync(join(tmpDir, ".hidden"), "secret");
    mkdirSync(join(tmpDir, ".git"));
    writeFileSync(join(tmpDir, ".git", "config"), "");
    writeFileSync(join(tmpDir, "visible.ts"), "");

    const files = await service.listFiles(tmpDir);
    const names = files.map((f) => f.name);
    expect(names).not.toContain(".hidden");
    expect(names).not.toContain("config");
    expect(names).toContain("visible.ts");
  });

  it("returns empty array for non-existent workspace", async () => {
    const files = await service.listFiles("/nonexistent/path/xyz");
    expect(files).toHaveLength(0);
  });

  it("reads file content from workspace", async () => {
    writeFileSync(join(tmpDir, "hello.ts"), "const x = 42;");
    const content = await service.readFile(tmpDir, "hello.ts");
    expect(content).toBe("const x = 42;");
  });

  it("rejects path traversal outside workspace", async () => {
    await expect(service.readFile(tmpDir, "../etc/passwd")).rejects.toThrow("Access denied");
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
