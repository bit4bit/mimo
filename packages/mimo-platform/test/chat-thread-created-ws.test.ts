// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("chat.js chat_thread_created handler", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "public", "js", "chat.js"),
    "utf-8",
  );

  it("handles the chat_thread_created WS message", () => {
    expect(source.includes('case "chat_thread_created":')).toBe(true);
    expect(source.includes("function handleChatThreadCreated(")).toBe(true);
  });

  it("appends to the thread list and re-renders the tabs", () => {
    expect(source.includes("ChatThreadsState.threads.push(thread)")).toBe(true);
    expect(source.includes("updateThreadTabsUI()")).toBe(true);
  });

  it("is idempotent (skips a thread id already present)", () => {
    expect(
      source.includes(
        "ChatThreadsState.threads.some((t) => t.id === thread.id)",
      ),
    ).toBe(true);
  });

  it("surfaces a chat_thread_create_failed event via a notification", () => {
    expect(source.includes('case "chat_thread_create_failed":')).toBe(true);
    expect(source.includes("function handleChatThreadCreateFailed(")).toBe(
      true,
    );
    expect(source.includes("showNotification(`New thread not created:")).toBe(
      true,
    );
  });

  it("does not switch the active thread", () => {
    // The handler must not call switchToThread / activateThread.
    const handler = source.slice(
      source.indexOf("function handleChatThreadCreated("),
    );
    const body = handler.slice(0, handler.indexOf("\n}\n"));
    expect(body.includes("switchToThread")).toBe(false);
    expect(body.includes("activateThread")).toBe(false);
  });
});
