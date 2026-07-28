// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { renderToString } from "hono/jsx/dom/server";
import { jsx } from "hono/jsx";

describe("ReviewBuffer", () => {
  it("renders a GitHub-style compare bar from the project branch to the current branch", async () => {
    const { ReviewBuffer } =
      await import("../../../src/web/features/sessions/components/buffers/ReviewBuffer.tsx");

    const html = await renderToString(
      jsx(ReviewBuffer, {
        sessionId: "test-session",
        baseBranch: "main",
        headBranch: "agent-work",
      }),
    );

    expect(html).toContain('class="review-compare"');
    expect(html).toContain("main");
    expect(html).toContain("agent-work");
    expect(html).toContain("→");
  });

  it("falls back to initial/current labels when branch names are unavailable", async () => {
    const { ReviewBuffer } =
      await import("../../../src/web/features/sessions/components/buffers/ReviewBuffer.tsx");

    const html = await renderToString(
      jsx(ReviewBuffer, { sessionId: "test-session" }),
    );

    expect(html).toContain("initial");
    expect(html).toContain("current");
  });
});
