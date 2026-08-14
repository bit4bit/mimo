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

describe("chat-threads.js rename modal", () => {
  describe("double-click opens a rename modal", () => {
    it("binds a dblclick handler on each thread tab that opens the rename dialog", () => {
      expect(
        chatThreadsSource.includes(
          'tab.addEventListener("dblclick"',
        ),
      ).toBe(true);
      expect(
        chatThreadsSource.includes("showRenameThreadDialog(thread)"),
      ).toBe(true);
    });

    it("wraps the tab name in a span", () => {
      expect(
        chatThreadsSource.includes('<span class="chat-thread-name">'),
      ).toBe(true);
    });

    it("showRenameThreadDialog creates a modal overlay with a text input", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain('document.createElement("div")');
      expect(body).toContain('overlay.id = "rename-thread-dialog"');
      expect(body).toContain('overlay.className = "modal"');
      expect(body).toContain("document.body.appendChild(overlay)");
    });

    it("pre-fills the input with the current thread name and autofocus", () => {
      expect(
        chatThreadsSource.includes(
          'id="rename-thread-input" maxlength="60" autofocus value="${escapeHtml(thread.name)}"',
        ),
      ).toBe(true);
    });

    it("focuses and selects the input text", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain("input.focus()");
      expect(body).toContain("input.select()");
    });

    it("prevents opening multiple rename dialogs at once", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain(
        'document.querySelector("#rename-thread-dialog")',
      );
      expect(body).toContain("return;");
    });

    it("caps the rename input at 60 characters", () => {
      expect(chatThreadsSource).toContain(
        'id="rename-thread-input" maxlength="60"',
      );
    });
  });

  describe("Save commits, Cancel/Escape closes, click-outside closes", () => {
    it("form submit handler validates and commits via updateThread", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain('form.addEventListener("submit"');
      expect(body).toContain("await updateThread(thread.id, { name: newName })");
    });

    it("Escape closes the dialog", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain('e.key === "Escape"');
      expect(body).toContain("closeDialog()");
    });

    it("Cancel button closes the dialog", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain('cancelBtn.addEventListener("click", closeDialog)');
    });

    it("clicking the overlay outside the form closes the dialog", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain('overlay.addEventListener("mousedown"');
      expect(body).toContain("e.target === overlay");
      expect(body).toContain("closeDialog()");
    });
  });

  describe("client-side pre-validation", () => {
    it("rejects an empty/whitespace-only name without a request", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      const emptyBranch = body.slice(0, body.indexOf("updateThread("));
      expect(emptyBranch).toContain("!newName.trim()");
      expect(emptyBranch).toContain('showError("Name cannot be empty")');
    });

    it("treats an unchanged name as a no-op close", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      const unchangedBranch = body.slice(0, body.indexOf("updateThread("));
      expect(unchangedBranch).toContain("newName === thread.name");
      expect(unchangedBranch).toContain("closeDialog()");
    });

    it("detects a duplicate name and shows an error without sending a request", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain(
        "(t) => t.name === newName && t.id !== thread.id",
      );
      const duplicateBranch = body.slice(0, body.indexOf("updateThread("));
      expect(duplicateBranch).not.toContain("updateThread(");
      expect(body).toContain(
        'showError("A thread with this name already exists in this session")',
      );
    });
  });

  describe("error surfacing from updateThread()", () => {
    it("updateThread re-throws on error instead of silently returning null", () => {
      const body = functionBody(chatThreadsSource, "updateThread");
      const catchBlock = body.slice(body.indexOf("} catch (error) {"));
      expect(catchBlock).toContain("throw error");
      expect(catchBlock).not.toContain("return null");
    });

    it("the rename dialog catches the error and shows feedback", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain("await updateThread(thread.id, { name: newName })");
      expect(body).toContain("} catch (error) {");
      expect(body).toContain("showError(message)");
    });

    it("showError sets a red border and error text", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain("1px solid #ff6b6b");
      expect(body).toContain("errorEl.textContent = message");
    });

    it("typing clears any visible error", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain('input.addEventListener("input", clearError)');
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
    it("refreshes summary-buffer selects after a successful rename", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain("updateSummaryBufferSelects()");
    });

    it("updates the context bar when the renamed thread is active", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain("thread.id === ChatThreadsState.activeThreadId");
      expect(body).toContain("updateThreadContextUI()");
    });

    it("re-renders the tabs after a successful rename", () => {
      const body = functionBody(chatThreadsSource, "showRenameThreadDialog");
      expect(body).toContain("updateThreadTabsUI()");
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