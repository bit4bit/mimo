// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { TerminalOutputBuffer } from "../src/api/websocket/terminal-output-buffer.js";

describe("TerminalOutputBuffer", () => {
  it("stores output for a session:terminal key", () => {
    const buffer = new TerminalOutputBuffer();
    const data = Buffer.from("hello world");
    buffer.append("session-1", "term-1", data);
    expect(buffer.get("session-1", "term-1")?.toString()).toBe("hello world");
  });

  it("returns undefined for unknown keys", () => {
    const buffer = new TerminalOutputBuffer();
    expect(buffer.get("session-1", "term-1")).toBeUndefined();
  });

  it("appends data in order", () => {
    const buffer = new TerminalOutputBuffer();
    buffer.append("session-1", "term-1", Buffer.from("hello "));
    buffer.append("session-1", "term-1", Buffer.from("world"));
    expect(buffer.get("session-1", "term-1")?.toString()).toBe("hello world");
  });

  it("keeps separate buffers per terminal", () => {
    const buffer = new TerminalOutputBuffer();
    buffer.append("session-1", "term-1", Buffer.from("a"));
    buffer.append("session-1", "term-2", Buffer.from("b"));
    expect(buffer.get("session-1", "term-1")?.toString()).toBe("a");
    expect(buffer.get("session-1", "term-2")?.toString()).toBe("b");
  });

  it("clears a buffer", () => {
    const buffer = new TerminalOutputBuffer();
    buffer.append("session-1", "term-1", Buffer.from("data"));
    buffer.clear("session-1", "term-1");
    expect(buffer.get("session-1", "term-1")).toBeUndefined();
  });

  it("truncates to the configured max size keeping the newest data", () => {
    const buffer = new TerminalOutputBuffer(10);
    buffer.append("session-1", "term-1", Buffer.from("0123456789"));
    buffer.append("session-1", "term-1", Buffer.from("abc"));
    expect(buffer.get("session-1", "term-1")?.toString()).toBe("3456789abc");
  });
});
