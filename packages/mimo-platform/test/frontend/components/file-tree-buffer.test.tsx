import { describe, it, expect } from "bun:test";
import { renderToString } from "hono/jsx/dom/server";
import { jsx } from "hono/jsx";

describe("FileTreeBuffer", () => {
  it("renders the shell with data-session-id, data-buffer-id, and refresh button", async () => {
    const { FileTreeBuffer } =
      await import("../../../src/web/features/sessions/components/buffers/FileTreeBuffer.tsx");

    const html = await renderToString(
      jsx(FileTreeBuffer, { sessionId: "test-session", isActive: false }),
    );

    expect(html).toContain('class="file-tree-buffer"');
    expect(html).toContain('data-session-id="test-session"');
    expect(html).toContain('data-buffer-id="file-tree"');
    expect(html).toContain('id="file-tree-refresh-btn"');
    expect(html).toContain('id="file-tree-content"');
  });

  it("renders the initial loading prompt", async () => {
    const { FileTreeBuffer } =
      await import("../../../src/web/features/sessions/components/buffers/FileTreeBuffer.tsx");

    const html = await renderToString(
      jsx(FileTreeBuffer, { sessionId: "s1", isActive: false }),
    );

    expect(html).toContain("Loading workspace");
  });

  it("includes tree CSS classes used by the client-side renderer", async () => {
    const { FileTreeBuffer } =
      await import("../../../src/web/features/sessions/components/buffers/FileTreeBuffer.tsx");

    const html = await renderToString(
      jsx(FileTreeBuffer, { sessionId: "s1", isActive: false }),
    );

    expect(html).toContain(".tree-root");
    expect(html).toContain(".tree-dir");
    expect(html).toContain(".tree-leaf");
    expect(html).toContain(".tree-children");
    expect(html).toContain(".file-status-new");
    expect(html).toContain(".file-status-changed");
  });
});
