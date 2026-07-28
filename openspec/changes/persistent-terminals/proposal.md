# Proposal: persistent-terminals

## Why

Reloading the browser leaves an existing terminal showing a black, non-interactive pane: the shell process on the agent and the platform scrollback buffer both survive, but the frontend never re-attaches after page load (`init()` only renders tabs; `switchToTerminal()` is never called). Additionally, session idle/TTL logic treats a session with no attached browser as idle even when it has live terminals, so background terminals can be killed as a side effect of agent parking/shutdown. Terminals should live and die with the mimo-agent process and explicit deletion — never with browser attachment.

## What Changes

- **Auto-reattach on page load**: when the terminal buffer initializes and the session has terminals, automatically open the last-active terminal (remembered per session in `localStorage`), falling back to the first terminal with state `active`. Opening the tab creates the xterm instance and WebSocket, which triggers the existing server-side scrollback replay.
- **Tab-switch persistence**: record the active terminal id per session in `localStorage` whenever the user switches tabs, so reload restores the exact tab.
- **Idle veto for live terminals**: session idle/TTL evaluation SHALL treat a session with at least one terminal in state `active` as busy; browser attachment MUST NOT factor into terminal lifetime.
- **No durable scrollback**: on platform restart the in-memory `TerminalOutputBuffer` is lost; the shell process survives and the terminal remains interactive, but prior output is not replayed. This is accepted behavior, not a gap to fix.
- **Agent restart kills terminals**: terminal processes are children of mimo-agent and die with it. Accepted as the defined lifetime boundary.

## Capabilities

### New Capabilities
- `terminal-persistence`: terminal lifetime semantics (bound to agent process + explicit delete, independent of browser), auto-reattach on page load with per-session last-active-tab restore.

### Modified Capabilities
- `session-idle-config`: idle evaluation must treat sessions with live terminals as busy (idle veto), so parking/TTL never kills a session solely because no browser is attached while terminals are running.

## Impact

- `packages/mimo-platform/public/js/terminal.js`: auto-reattach on init, `localStorage` tracking of active terminal per session.
- Session idle/TTL evaluation code (agent-lifecycle / idle timeout path): add live-terminal veto.
- No API or protocol changes; existing WS attach + scrollback replay path is reused as-is.
- No changes required in `packages/mimo-agent` (processes already outlive browser connections).
