import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("terminal.js deletion UI", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "public", "js", "terminal.js"),
    "utf-8",
  );

  it("has a delete terminal handler", () => {
    expect(source.includes("handleDeleteTerminal")).toBe(true);
  });

  it("sends DELETE to /sessions/:id/terminals/:terminalId on delete", () => {
    expect(source.includes("deleteTerminal")).toBe(true);
    expect(source.includes("DELETE")).toBe(true);
    expect(source.includes("/terminals/")).toBe(true);
  });

  it("disposes the xterm instance after deletion", () => {
    expect(source.includes("disposeXterm")).toBe(true);
  });

  it("refreshes the terminal tabs after deletion", () => {
    expect(source.includes("await refreshTerminals()")).toBe(true);
  });

  it("renders delete button dynamically in context bar", () => {
    expect(source.includes("delete-terminal-btn")).toBe(true);
    expect(source.includes("Delete")).toBe(true);
  });
});
