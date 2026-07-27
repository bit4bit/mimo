import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("terminal.js dialog and UI", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "public", "js", "terminal.js"),
    "utf-8",
  );

  it("shows a name input, agent selector, command input, subpath input, and scrollback field", () => {
    expect(source.includes('id="terminal-name-input"')).toBe(true);
    expect(source.includes('id="terminal-agent-select"')).toBe(true);
    expect(source.includes('id="terminal-command-input"')).toBe(true);
    expect(source.includes('id="terminal-subpath-input"')).toBe(true);
    expect(source.includes('id="terminal-scrollback-input"')).toBe(true);
  });

  it("agent selector does not allow None", () => {
    expect(source.includes("disabled selected>Select an agent")).toBe(true);
  });

  it("command field defaults to /bin/sh", () => {
    expect(source.includes('value="/bin/sh"')).toBe(true);
    expect(source.includes('id="terminal-command-input"')).toBe(true);
  });

  it("scrollback field defaults to 1000", () => {
    expect(source.includes('value="1000"')).toBe(true);
  });

  it("validates required fields before submitting", () => {
    expect(source.includes("Name is required")).toBe(true);
    expect(source.includes("Agent is required")).toBe(true);
  });

  it("POSTs to /sessions/:id/terminals on submit", () => {
    expect(source.includes("/terminals")).toBe(true);
    expect(source.includes("POST")).toBe(true);
  });

  it("fetches online agents from /agents/list?status=online", () => {
    expect(source.includes("/agents/list?status=online")).toBe(true);
  });

  it("uses tab-based UI matching Chat (terminal-threads-tabs)", () => {
    expect(source.includes("terminal-threads-tabs")).toBe(true);
    expect(source.includes("renderTerminalTabs")).toBe(true);
  });

  it("renders Delete button in context bar", () => {
    expect(source.includes("delete-terminal-btn")).toBe(true);
    expect(source.includes("handleDeleteTerminal")).toBe(true);
  });

  it("DELETEs terminal on delete button click", () => {
    expect(source.includes("deleteTerminal")).toBe(true);
    expect(source.includes("DELETE")).toBe(true);
  });

  it("initializes xterm.js with configured scrollback", () => {
    expect(source.includes("new Terminal(")).toBe(true);
    expect(source.includes("scrollback:")).toBe(true);
  });

  it("opens WebSocket to /ws/terminal/:sessionId/:terminalId", () => {
    expect(source.includes("/ws/terminal/")).toBe(true);
    expect(source.includes("WebSocket(")).toBe(true);
  });

  it("writes received binary data to xterm", () => {
    expect(source.includes("xtermInstance.write")).toBe(true);
    expect(source.includes("ArrayBuffer")).toBe(true);
  });

  it("sends user input as binary frames over the terminal WebSocket", () => {
    expect(source.includes("xtermInstance.onData")).toBe(true);
    expect(source.includes("terminalWs.send(data)")).toBe(true);
  });

  it("handles terminal exit by displaying exit message", () => {
    expect(source.includes("terminal_exited")).toBe(true);
    expect(source.includes("Process exited")).toBe(true);
  });

  it("disposes xterm instance and WebSocket on deactivation", () => {
    expect(source.includes("disposeXterm")).toBe(true);
    expect(source.includes("xtermInstance.dispose()")).toBe(true);
    expect(source.includes("terminalWs.close()")).toBe(true);
  });

  it("renders context bar with terminal info", () => {
    expect(source.includes("renderContextBar")).toBe(true);
    expect(source.includes("terminal-context-bar")).toBe(true);
  });

  it("refreshes terminal tabs after deletion", () => {
    expect(source.includes("await refreshTerminals()")).toBe(true);
  });
});