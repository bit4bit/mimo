import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("SessionDetailPage terminal wiring", () => {
  const source = readFileSync(
    join(
      import.meta.dir,
      "..",
      "src",
      "web",
      "features",
      "sessions",
      "components",
      "SessionDetailPage.tsx",
    ),
    "utf-8",
  );

  it("passes terminals as buffer props to the terminal buffer", () => {
    expect(source.includes("terminal:")).toBe(true);
    expect(source.includes("terminals:")).toBe(true);
    expect(source.includes("activeTerminalId")).toBe(true);
  });

  it("reads terminals from the session object", () => {
    expect(source.includes("session.terminals")).toBe(true);
  });
});
