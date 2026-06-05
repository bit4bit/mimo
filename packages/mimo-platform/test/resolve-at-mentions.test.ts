import { describe, it, expect } from "bun:test";
import {
  parseAtMentions,
  resolveAtMentions,
} from "../src/domain/chat/resolve-at-mentions.js";
import type { FileService } from "../src/domain/files/types.js";

describe("parseAtMentions", () => {
  it("extracts single @path from message", () => {
    expect(parseAtMentions("fix the bug in @src/app.ts")).toEqual([
      "src/app.ts",
    ]);
  });

  it("extracts multiple @paths from message", () => {
    expect(parseAtMentions("compare @src/a.ts and @src/b.ts")).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });

  it("extracts @path at start of message", () => {
    expect(parseAtMentions("@src/app.ts has a bug")).toEqual(["src/app.ts"]);
  });

  it("deduplicates repeated @paths", () => {
    expect(parseAtMentions("@src/a.ts and @src/a.ts")).toEqual(["src/a.ts"]);
  });

  it("returns empty array when no @ mentions", () => {
    expect(parseAtMentions("no mentions here")).toEqual([]);
  });

  it("does not match @ in middle of word", () => {
    expect(parseAtMentions("email@example.com")).toEqual([]);
  });
});

describe("resolveAtMentions", () => {
  function fakeFileService(files: Record<string, string>): FileService {
    return {
      listFiles: async () => [],
      readFile: async (_workspace: string, path: string) => {
        if (path in files) return files[path];
        throw new Error("File not found: " + path);
      },
    };
  }

  it("prepends file content for a single @mention", async () => {
    const fs = fakeFileService({ "src/app.ts": "console.log('hello');" });
    const result = await resolveAtMentions(
      "fix the bug in @src/app.ts",
      "/workspace",
      fs,
    );

    expect(result).toContain('<file path="src/app.ts">');
    expect(result).toContain("console.log('hello');");
    expect(result).toContain("fix the bug in @src/app.ts");
  });

  it("prepends multiple file blocks for multiple @mentions", async () => {
    const fs = fakeFileService({
      "src/a.ts": "file a content",
      "src/b.ts": "file b content",
    });
    const result = await resolveAtMentions(
      "compare @src/a.ts and @src/b.ts",
      "/workspace",
      fs,
    );

    expect(result).toContain('<file path="src/a.ts">');
    expect(result).toContain("file a content");
    expect(result).toContain('<file path="src/b.ts">');
    expect(result).toContain("file b content");
  });

  it("leaves message unchanged when file does not exist", async () => {
    const fs = fakeFileService({});
    const result = await resolveAtMentions(
      "look at @nonexistent.ts",
      "/workspace",
      fs,
    );

    expect(result).toBe("look at @nonexistent.ts");
  });

  it("returns original message when no @mentions present", async () => {
    const fs = fakeFileService({});
    const result = await resolveAtMentions(
      "no mentions here",
      "/workspace",
      fs,
    );

    expect(result).toBe("no mentions here");
  });

  it("resolves existing files and leaves non-existent ones as-is", async () => {
    const fs = fakeFileService({ "src/real.ts": "real content" });
    const result = await resolveAtMentions(
      "check @src/real.ts and @src/fake.ts",
      "/workspace",
      fs,
    );

    expect(result).toContain('<file path="src/real.ts">');
    expect(result).toContain("real content");
    expect(result).not.toContain('<file path="src/fake.ts">');
    expect(result).toContain("@src/fake.ts");
  });
});
