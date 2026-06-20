import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("EditBuffer file finder cache invalidation", () => {
  const editBufferSource = readFileSync(
    join(import.meta.dir, "..", "public", "js", "edit-buffer.js"),
    "utf-8",
  );
  const chatSource = readFileSync(
    join(import.meta.dir, "..", "public", "js", "chat.js"),
    "utf-8",
  );

  it("invalidateFileList resets fileFinderLoaded and clears allFiles", () => {
    expect(editBufferSource).toContain("function invalidateFileList()");
    expect(editBufferSource).toContain("fileFinderLoaded = false");
    expect(editBufferSource).toContain("allFiles = []");
  });

  it("invalidateFileList is exposed on window.EditBuffer", () => {
    expect(editBufferSource).toContain(
      "invalidateFileList: invalidateFileList",
    );
  });

  it("openFileFinder re-fetches when fileFinderLoaded is false after invalidation", () => {
    expect(editBufferSource).toContain(
      "if (!fileFinderLoaded) {\n      loadFileList(pattern);\n    }",
    );
  });

  it("chat WebSocket handler forwards file_list_invalidated to EditBuffer", () => {
    expect(chatSource).toContain("file_list_invalidated");
    expect(chatSource).toContain("invalidateFileList");
  });
});
