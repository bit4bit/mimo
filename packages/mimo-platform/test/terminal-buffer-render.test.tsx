import { describe, it, expect } from "bun:test";
import { renderToString } from "hono/jsx/dom/server";
import { TerminalBuffer } from "../src/web/features/sessions/components/buffers/TerminalBuffer.js";

describe("Terminal buffer rendering", () => {
  it("shows empty state when no terminals exist", () => {
    const html = renderToString(
      <TerminalBuffer sessionId="s1" isActive={true} terminals={[]} />,
    );
    expect(html).toContain("No terminals yet");
    expect(html).toContain("interacting with the shell");
  });

  it("shows terminal tabs when terminals exist (matching Chat UI)", () => {
    const html = renderToString(
      <TerminalBuffer
        sessionId="s1"
        isActive={true}
        terminals={[
          {
            id: "t1",
            name: "build-shell",
            assignedAgentId: "agent-01",
            scrollback: 1000,
            state: "active",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ]}
        activeTerminalId="t1"
      />,
    );
    expect(html).toContain("terminal-threads-tabs");
    expect(html).toContain("terminal-thread-tab");
    expect(html).toContain("build-shell");
    expect(html).toContain("create-terminal-btn");
  });

  it("shows + button for creating new terminal", () => {
    const html = renderToString(
      <TerminalBuffer sessionId="s1" isActive={true} terminals={[]} />,
    );
    expect(html).toContain('id="create-terminal-btn"');
  });

  it("shows context bar with terminal name, command, and Delete button", () => {
    const html = renderToString(
      <TerminalBuffer
        sessionId="s1"
        isActive={true}
        terminals={[
          {
            id: "t1",
            name: "my-shell",
            assignedAgentId: "agent-01",
            command: "bash -l",
            scrollback: 5000,
            state: "active",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ]}
        activeTerminalId="t1"
      />,
    );
    expect(html).toContain("terminal-context-bar");
    expect(html).toContain("my-shell");
    expect(html).toContain("bash -l");
    expect(html).toContain('id="delete-terminal-btn"');
    expect(html).toContain("Delete");
  });

  it("shows subpath in context bar when set", () => {
    const html = renderToString(
      <TerminalBuffer
        sessionId="s1"
        isActive={true}
        terminals={[
          {
            id: "t1",
            name: "shell",
            assignedAgentId: "agent-01",
            subpath: "packages/backend",
            scrollback: 1000,
            state: "active",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ]}
        activeTerminalId="t1"
      />,
    );
    expect(html).toContain("packages/backend");
  });

  it("renders xterm container div (always present, hidden when no terminals)", () => {
    const html = renderToString(
      <TerminalBuffer sessionId="s1" isActive={true} terminals={[]} />,
    );
    expect(html).toContain('id="terminal-xterm-container"');
  });

  it("shows dead indicator for exited terminals", () => {
    const html = renderToString(
      <TerminalBuffer
        sessionId="s1"
        isActive={true}
        terminals={[
          {
            id: "t1",
            name: "dead-shell",
            assignedAgentId: "agent-01",
            scrollback: 1000,
            state: "dead",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ]}
        activeTerminalId="t1"
      />,
    );
    expect(html).toContain("🔴");
  });

  it("shows active indicator for live terminals", () => {
    const html = renderToString(
      <TerminalBuffer
        sessionId="s1"
        isActive={true}
        terminals={[
          {
            id: "t1",
            name: "live-shell",
            assignedAgentId: "agent-01",
            scrollback: 1000,
            state: "active",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ]}
        activeTerminalId="t1"
      />,
    );
    expect(html).toContain("🟢");
  });

  it("shows 'No active terminal' in context bar when no terminals", () => {
    const html = renderToString(
      <TerminalBuffer sessionId="s1" isActive={true} terminals={[]} />,
    );
    expect(html).toContain("No active terminal");
    expect(html).toContain("Use + to get started");
  });
});
