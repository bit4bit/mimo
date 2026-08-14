import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("Chat input bubble vs modal guard", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "..", "..", "public", "js", "chat.js"),
    "utf-8",
  );

  it("insertEditableBubble only skips insertion when a modal is actually open", () => {
    // The session page always contains a hidden modal
    // (<div id="clone-workspace-dialog" class="modal hidden">). Guarding on the
    // mere presence of a .modal element makes the chat input never appear.
    // The guard must only match visible (non-hidden) modals.
    expect(source).toContain('document.querySelector(".modal:not(.hidden)")');
    expect(source).not.toContain('document.querySelector(".modal")');
  });
});
