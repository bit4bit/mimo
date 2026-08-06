/**
 * Multi-repo sync_now behavior test.
 *
 * Behavior: when a session has multiple repositories, handleSyncNow MUST run
 * git add/commit/push in EACH repository's checkoutPath, not only the session
 * root checkoutPath. Otherwise changes made in non-default repos (e.g.
 * "second/test.md") are never committed/pushed, so the platform never pulls
 * them and the file explorer + impact buffer never see the file.
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("handleSyncNow multi-repo fan-out", () => {
  it("runs git add/commit/push per repository checkoutPath, not only the session root", () => {
    const source = readFileSync(
      join(import.meta.dir, "..", "src", "index.ts"),
      "utf-8",
    );

    // Locate handleSyncNow body (the private method definition).
    const defMarker = "private async handleSyncNow(message";
    const handlerStart = source.indexOf(defMarker);
    expect(handlerStart).toBeGreaterThan(-1);
    // Find the next "private " method after the handler start.
    const searchFrom = handlerStart + defMarker.length;
    const nextPrivate = source.indexOf("\n  private ", searchFrom);
    const body =
      nextPrivate > handlerStart ? source.slice(handlerStart, nextPrivate) : source.slice(handlerStart);

    // Must reference session.repos (the per-repo list) so each repo's
    // checkoutPath drives git operations.
    expect(body).toContain("session.repos");

    // Must run git operations inside a per-repo loop using each repo's
    // checkoutPath as the cwd (the legacy implementation used only
    // session.checkoutPath as the cwd for all git commands).
    expect(body).toMatch(/for\s*\(\s*const\s+\w+\s+of\s+\w+\b/);
    expect(body).toMatch(/repo\.checkoutPath/);
    expect(body).toMatch(/cwd,\s*timeoutMs/);

    // The root-only cwd must not be the only cwd used for git operations.
    expect(body).not.toMatch(/cwd:\s*session\.checkoutPath\b/);
  });
});