// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

interface TerminalInfo {
  id: string;
  name: string;
  assignedAgentId: string;
  command: string;
  subpath?: string;
  scrollback: number;
  state: "active" | "dead";
  createdAt: string;
}

interface TerminalBufferProps extends BufferProps {
  terminals?: TerminalInfo[];
  activeTerminalId?: string;
}

export const TerminalBuffer: FC<TerminalBufferProps> = ({
  sessionId,
  isActive,
  terminals = [],
  activeTerminalId,
}) => {
  const activeTerminal =
    terminals.find((t) => t.id === activeTerminalId) ??
    terminals.find((t) => t.state === "active") ??
    terminals[0];

  return (
    <div
      class="terminal-threads-container buffer-container"
      data-session-id={sessionId}
      data-active-terminal-id={activeTerminal?.id ?? ""}
    >
      {/* Terminal Tabs */}
      <div class="terminal-threads-tabs">
        {/* Create terminal button */}
        <button
          type="button"
          id="create-terminal-btn"
          class="terminal-thread-action-btn"
          title="Create new terminal"
          style="color: #4caf50;"
        >
          +
        </button>

        {terminals.map((terminal) => {
          const icon = terminal.state === "dead" ? "🔴" : "🟢";
          const title =
            terminal.state === "dead"
              ? "Terminal process has exited"
              : "Terminal is active";

          return (
            <button
              type="button"
              class={`terminal-thread-tab ${terminal.id === activeTerminal?.id ? "active" : ""}`}
              data-terminal-id={terminal.id}
            >
              <span
                class="terminal-status-indicator"
                data-terminal-state={terminal.state}
                title={title}
              >
                {icon}
              </span>
              {terminal.name}
            </button>
          );
        })}
      </div>

      {/* Terminal Context Bar */}
      <div class="terminal-thread-context terminal-context-bar">
        {activeTerminal && (
          <>
            <div class="terminal-context-item text-muted">
              Terminal: <span class="text-primary">{activeTerminal.name}</span>
            </div>

            <div class="terminal-context-item text-muted">
              Command:{" "}
              <span class="text-primary">{activeTerminal.command}</span>
            </div>

            {activeTerminal.subpath && (
              <div class="terminal-context-item text-muted">
                Folder:{" "}
                <span class="text-primary">{activeTerminal.subpath}</span>
              </div>
            )}

            <div class="terminal-context-item text-muted">
              Scrollback:{" "}
              <span class="text-primary">{activeTerminal.scrollback}</span>
            </div>

            {/* Spacer to push delete button to the right */}
            <div class="flex-grow"></div>

            <button
              type="button"
              id="delete-terminal-btn"
              data-terminal-id={activeTerminal.id}
              class="terminal-delete-btn"
              title="Delete this terminal"
            >
              Delete
            </button>
          </>
        )}
        {!activeTerminal && (
          <div class="text-small text-muted">
            No active terminal. Use + to get started.
          </div>
        )}
      </div>

      {/* Terminal Content Area */}
      <div class="terminal-content-wrapper flex flex-col flex-grow">
        <div
          id="terminal-empty-state"
          class="terminal-empty-state text-muted"
          style={terminals.length === 0 ? "" : "display:none;"}
        >
          <p>No terminals yet.</p>
          <p class="text-small">
            Create a terminal to start interacting with the shell
          </p>
        </div>
        <div
          id="terminal-xterm-container"
          class="terminal-xterm-container"
          style={terminals.length === 0 ? "display:none;" : ""}
        ></div>
      </div>

      <style>{`
        .terminal-threads-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }
        .terminal-threads-tabs {
          display: flex;
          background: #2d2d2d;
          border-bottom: 1px solid #444;
          overflow-x: auto;
        }
        .terminal-thread-tab {
          padding: 8px 16px;
          border: none;
          border-right: 1px solid #444;
          background: transparent;
          color: #888;
          cursor: pointer;
          font-family: monospace;
          font-size: 12px;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .terminal-thread-tab.active {
          background: #1a1a1a;
          color: #d4d4d4;
        }
        .terminal-thread-action-btn {
          padding: 8px 12px;
          border: none;
          border-right: 1px solid #444;
          background: transparent;
          color: #888;
          cursor: pointer;
          font-family: monospace;
          font-size: 12px;
          white-space: nowrap;
        }
        .terminal-status-indicator {
          cursor: help;
        }
        .terminal-context-bar {
          padding: 8px 12px;
          background: #252525;
          border-bottom: 1px solid #444;
          display: flex;
          gap: 15px;
          align-items: center;
          font-size: 12px;
        }
        .terminal-context-item {
          white-space: nowrap;
        }
        .terminal-delete-btn {
          padding: 4px 8px;
          background: transparent;
          border: 1px solid #555;
          color: #888;
          font-family: monospace;
          font-size: 10px;
          cursor: pointer;
          border-radius: 3px;
          white-space: nowrap;
        }
        .terminal-delete-btn:hover {
          border-color: #f85149;
          color: #f85149;
        }
        .terminal-content-wrapper {
          min-height: 0;
          overflow: hidden;
        }
        .terminal-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          color: #888;
          font-size: 13px;
        }
        .terminal-xterm-container {
          flex: 1;
          min-height: 0;
          background: #000;
          padding: 4px;
        }
      `}</style>
    </div>
  );
};
