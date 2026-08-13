// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const chatThreadsSource = readFileSync(
  join(import.meta.dir, "..", "..", "..", "public", "js", "chat-threads.js"),
  "utf-8",
);
const chatSource = readFileSync(
  join(import.meta.dir, "..", "..", "..", "public", "js", "chat.js"),
  "utf-8",
);

// Extract the full body of a named top-level function.
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\n}\n", start));
}

describe("chat-threads.js inline rename", () => {
  describe("double-click enters inline edit mode", () => {
    it("binds a dblclick handler on each thread tab to startInlineRename", () => {
      expect(
        chatThreadsSource.includes(
          'tab.addEventListener("dblclick", () => startInlineRename(thread))',
        ),
      ).toBe(true);
    });

    it("wraps the tab name in a span so the edit input can replace it", () => {
      expect(
        chatThreadsSource.includes('<span class="chat-thread-name">'),
      ).toBe(true);
    });

    it("startInlineRename replaces the name span with a pre-filled text input", () => {
      const body = functionBody(chatThreadsSource, "startInlineRename");
      expect(body).toContain('document.createElement("input")');
      expect(body).toContain('input.type = "text"');
      expect(body).toContain('input.className = "chat-thread-name-input"');
      expect(body).toContain("input.value = thread.name");
      expect(body).toContain("input.maxLength = 60");
      expect(body).toContain("nameSpan.replaceWith(input)");
    });

    it("selects all text and focuses the input for quick replacement", () => {
      const body = functionBody(chatThreadsSource, "startInlineRename");
      expect(body).toContain("input.focus()");
      expect(body).toContain("input.select()");
    });

    it("allows only one tab to be edited at a time", () => {
      const body = functionBody(chatThreadsSource, "startInlineRename");
      expect(body).toContain("ChatThreadsState.editingThreadId");
      expect(body).toContain("if (ChatThreadsState.editingThreadId) return;");
    });

    it("caps the inline rename input at 60 characters", () => {
      const body = functionBody(chatThreadsSource, "startInlineRename");
      expect(body).toContain("input.maxLength = 60");
    });
  });

  describe("Enter commits, Escape cancels, blur commits-or-cancels", () => {
    it("Enter commits via commitInlineRename", () => {
      const body = functionBody(chatThreadsSource, "startInlineRename");
      expect(body).toContain('e.key === "Enter"');
      expect(body).toContain("commitInlineRename(thread, input)");
    });

    it("Escape cancels via cancelInlineRename", () => {
      const body = functionBody(chatThreadsSource, "startInlineRename");
      expect(body).toContain('e.key === "Escape"');
      expect(body).toContain("cancelInlineRename(thread)");
    });

    it("blur commits the inline rename", () => {
      const body = functionBody(chatThreadsSource, "startInlineRename");
      expect(body).toContain('input.addEventListener("blur"');
      expect(body).toContain("commitInlineRename(thread, input)");
    });

    it("cancelInlineRename restores the tab via updateThreadTabsUI", () => {
      const body = functionBody(chatThreadsSource, "cancelInlineRename");
      expect(body).toContain("ChatThreadsState.editingThreadId = null");
      expect(body).toContain("updateThreadTabsUI()");
    });
  });

  describe("client-side pre-validation", () => {
    it("rejects an empty/whitespace-only name by cancelling without a request", () => {
      const body = functionBody(chatThreadsSource, "commitInlineRename");
      const emptyBranch = body.slice(0, body.indexOf("updateThread("));
      expect(emptyBranch).toContain("!newName.trim()");
      expect(emptyBranch).toContain("cancelInlineRename(thread)");
    });

    it("treats an unchanged name as a no-op cancel", () => {
      const body = functionBody(chatThreadsSource, "commitInlineRename");
      const unchangedBranch = body.slice(0, body.indexOf("updateThread("));
      expect(unchangedBranch).toContain("newName === thread.name");
      expect(unchangedBranch).toContain("cancelInlineRename(thread)");
    });

    it("detects a duplicate name against ChatThreadsState.threads and shows an inline error", () => {
      const body = functionBody(chatThreadsSource, "commitInlineRename");
      expect(body).toContain(
        "(t) => t.name === newName && t.id !== thread.id",
      );
      expect(body).toContain("showInlineRenameError(input,");
      const duplicateBranch = body.slice(0, body.indexOf("updateThread("));
      expect(duplicateBranch).not.toContain("updateThread(");
    });
  });

  describe("error surfacing from updateThread()", () => {
    it("updateThread re-throws on error instead of silently returning null", () => {
      const body = functionBody(chatThreadsSource, "updateThread");
      const catchBlock = body.slice(body.indexOf("} catch (error) {"));
      expect(catchBlock).toContain("throw error");
      expect(catchBlock).not.toContain("return null");
    });

    it("the rename commit catches the error and shows inline feedback", () => {
      const body = functionBody(chatThreadsSource, "commitInlineRename");
      expect(body).toContain("await updateThread(thread.id, { name: newName })");
      expect(body).toContain("} catch (error) {");
      expect(body).toContain("showInlineRenameError(input, message)");
    });

    it("showInlineRenameError marks the input with a red border", () => {
      const body = functionBody(chatThreadsSource, "showInlineRenameError");
      expect(body).toContain('input.classList.add("rename-error")');
      expect(body).toContain("1px solid #ff6b6b");
    });

    it("existing model/mode/brainwash callers tolerate the thrown error", () => {
      expect(
        chatThreadsSource.includes(
          "try {\n        await updateThread(threadId, { model: modelId });",
        ),
      ).toBe(true);
      expect(
        chatThreadsSource.includes(
          "try {\n        await updateThread(threadId, { mode: modeId });",
        ),
      ).toBe(true);
      expect(
        chatThreadsSource.includes(
          "try {\n        await updateThread(threadId, { brainWash: checked });",
        ),
      ).toBe(true);
    });
  });

  describe("secondary UI refresh after a successful rename", () => {
    it("refreshes summary-buffer selects after a successful inline rename", () => {
      const body = functionBody(chatThreadsSource, "commitInlineRename");
      expect(body).toContain("updateSummaryBufferSelects()");
    });

    it("updates the context bar when the renamed thread is active", () => {
      const body = functionBody(chatThreadsSource, "commitInlineRename");
      expect(body).toContain("thread.id === ChatThreadsState.activeThreadId");
      expect(body).toContain("updateThreadContextUI()");
    });
  });

  describe("create dialog name input maxlength", () => {
    it("caps the create-dialog name input at 60 characters", () => {
      expect(chatThreadsSource).toContain(
        'id="new-thread-name" maxlength="60"',
      );
    });
  });
});

describe("chat.js chat_thread_renamed handler", () => {
  it("handles the chat_thread_renamed WS message", () => {
    expect(chatSource.includes('case "chat_thread_renamed":')).toBe(true);
    expect(chatSource.includes("function handleChatThreadRenamed(")).toBe(true);
  });

  it("updates the thread name in local state and re-renders the tabs", () => {
    const body = functionBody(chatSource, "handleChatThreadRenamed");
    expect(body).toContain("ChatThreadsState.threads.findIndex((t) => t.id === threadId)");
    expect(body).toContain("ChatThreadsState.threads[idx] = {");
    expect(body).toContain("name,");
    expect(body).toContain("updateThreadTabsUI()");
  });

  it("updates the context bar when the renamed thread is active", () => {
    const body = functionBody(chatSource, "handleChatThreadRenamed");
    expect(body).toContain("ChatThreadsState.activeThreadId === threadId");
    expect(body).toContain("updateThreadContextUI()");
  });

  it("refreshes summary-buffer selects on a remote rename", () => {
    const body = functionBody(chatSource, "handleChatThreadRenamed");
    expect(body).toContain("updateSummaryBufferSelects()");
  });

  it("ignores messages for unknown threads or malformed payloads", () => {
    const body = functionBody(chatSource, "handleChatThreadRenamed");
    expect(body).toContain("findIndex((t) => t.id === threadId)");
    expect(body).toContain("if (idx === -1) return;");
    expect(body).toContain("typeof threadId !== \"string\"");
  });
});
