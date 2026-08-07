// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { renderToString } from "hono/jsx/dom/server";
import { jsx } from "hono/jsx";

describe("CommitBuffer", () => {
  it("renders the commit message textarea and confirm button", async () => {
    const { CommitBuffer } =
      await import("../../../src/web/features/sessions/components/buffers/CommitBuffer.tsx");

    const html = await renderToString(
      jsx(CommitBuffer, { sessionId: "test-session" }),
    );

    expect(html).toContain('id="commit-message"');
    expect(html).toContain('id="commit-confirm"');
    expect(html).toContain('id="commit-tree"');
    expect(html).toContain('id="sync-now-btn"');
    expect(html).toContain('id="force-push-btn"');
  });

  it("does not render the former commit dialog modal", async () => {
    const { CommitBuffer } =
      await import("../../../src/web/features/sessions/components/buffers/CommitBuffer.tsx");

    const html = await renderToString(
      jsx(CommitBuffer, { sessionId: "test-session" }),
    );

    expect(html).not.toContain('id="commit-dialog"');
    expect(html).not.toContain('id="commit-cancel"');
  });

  it("exposes the buffer panel id used by the activation observer", async () => {
    const { CommitBuffer } =
      await import("../../../src/web/features/sessions/components/buffers/CommitBuffer.tsx");

    const html = await renderToString(
      jsx(CommitBuffer, { sessionId: "test-session" }),
    );

    expect(html).toContain('id="commit-panel"');
    expect(html).toContain('data-buffer-panel="commit"');
  });
});
