import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("EditBuffer file finder mention mode", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "public", "js", "edit-buffer.js"),
    "utf-8",
  );

  it("openFileFinder accepts options parameter with mode and onSelect", () => {
    expect(source).toContain(
      "function openFileFinder(initialPattern, options)",
    );
    expect(source).toContain('options.mode === "mention"');
    expect(source).toContain("options.onSelect");
  });

  it("stores mention mode callback in module state", () => {
    expect(source).toContain('fileFinderMode = "mention"');
    expect(source).toContain("fileFinderOnSelect = options.onSelect");
  });

  it("confirmSelection calls onSelect callback in mention mode instead of selectFile", () => {
    expect(source).toContain(
      'fileFinderMode === "mention" && typeof fileFinderOnSelect === "function"',
    );
    // Verify the callback is captured before closeFileFinder clears state
    expect(source).toContain("var callback = fileFinderOnSelect");
    expect(source).toContain("callback(file)");
  });

  it("closeFileFinder resets mention mode state", () => {
    expect(source).toContain("fileFinderMode = null");
    expect(source).toContain("fileFinderOnSelect = null");
  });

  it("exposes openFileFinder on window for cross-module access", () => {
    expect(source).toContain("window.openFileFinder = openFileFinder");
  });
});
