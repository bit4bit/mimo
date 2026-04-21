import { describe, it, expect } from "bun:test";
import { renderToString } from "hono/jsx/dom/server";
import { jsx } from "hono/jsx";

describe("ImpactBuffer", () => {
  it("renders the shell with header and refresh button", async () => {
    const { ImpactBuffer } = await import("../src/components/ImpactBuffer.tsx");

    const html = await renderToString(
      jsx(ImpactBuffer, { sessionId: "test-session" }),
    );

    expect(html).toContain("Impact");
    expect(html).toContain("impact-refresh-btn");
    expect(html).toContain("impact-content");
  });

  it("renders the loading prompt as the initial state", async () => {
    const { ImpactBuffer } = await import("../src/components/ImpactBuffer.tsx");

    const html = await renderToString(
      jsx(ImpactBuffer, { sessionId: "test-session" }),
    );

    expect(html).toContain("Click Refresh");
  });

  it("includes CSS classes used by the client-side renderer", async () => {
    const { ImpactBuffer } = await import("../src/components/ImpactBuffer.tsx");

    const html = await renderToString(
      jsx(ImpactBuffer, { sessionId: "test-session" }),
    );

    // These classes are referenced by renderImpactMetrics in chat.js
    expect(html).toContain("impact-section");
    expect(html).toContain("impact-metric");
    expect(html).toContain("duplication-warning");
    expect(html).toContain("impact-dependency-section");
    expect(html).toContain("impact-dependency-line");
    expect(html).toContain("impact-dependency-files");
  });
});
