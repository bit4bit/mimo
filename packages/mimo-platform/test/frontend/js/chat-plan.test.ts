import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("chat.js plan handling", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "..", "..", "public", "js", "chat.js"),
    "utf-8",
  );

  it("dispatches the plan websocket message to handlePlan", () => {
    expect(source).toContain('case "plan":');
    expect(source).toContain("handlePlan(data.entries)");
  });

  it("filters plan updates to the active thread", () => {
    const caseMatch = source.match(
      /case "plan":[\s\S]*?handlePlan\(data\.entries\);/,
    );
    expect(caseMatch).toBeTruthy();
    expect(caseMatch![0]).toContain("data.chatThreadId !== activeThreadId");
  });

  it("renders entries into the plan-content container with status and priority", () => {
    const fnMatch = source.match(/function handlePlan\(entries\)[\s\S]*?\n}/m);
    expect(fnMatch).toBeTruthy();
    const fn = fnMatch![0];
    expect(fn).toContain('document.getElementById("plan-content")');
    expect(fn).toContain("plan-status-");
    expect(fn).toContain("plan-priority-");
    // agent-provided content must go through textContent, never innerHTML
    expect(fn).toContain("text.textContent = String(entry.content");
  });

  it("shows an empty state when the plan has no entries", () => {
    const fnMatch = source.match(/function handlePlan\(entries\)[\s\S]*?\n}/m);
    expect(fnMatch![0]).toContain("clearPlanView()");
    expect(source).toContain('class="plan-empty"');
  });

  it("clears the plan view on thread switch", () => {
    const fnMatch = source.match(
      /function prepareThreadSwitch\(\)[\s\S]*?\n}/m,
    );
    expect(fnMatch).toBeTruthy();
    expect(fnMatch![0]).toContain("clearPlanView()");
  });
});
