# Design: persistent-terminals

## Context

Terminal architecture today:

- The shell process is a child of **mimo-agent** (`terminalProcesses` map, `packages/mimo-agent/src/index.ts`). It has no coupling to any browser socket and already survives browser close.
- The platform relays output over `/ws/terminal/:sessionId/:terminalId` and keeps a 64KB in-memory scrollback per terminal (`TerminalOutputBuffer`), replayed to each newly connecting browser socket.
- The frontend (`packages/mimo-platform/public/js/terminal.js`) only creates the xterm instance + WebSocket inside `switchToTerminal()`. On page load, `init()` calls `refreshTerminals()` (renders tabs) but never switches — so after a reload the user sees tabs but a black, non-interactive pane.
- Idle handling lives in mimo-agent (`lifecycle.ts`): a session-level idle timer parks all ACP threads when it fires. The platform additionally has TTL auto-delete for sessions. Neither currently considers terminal liveness or terminal I/O activity.

## Goals / Non-Goals

**Goals:**

- After a browser reload (or a fresh browser attaching), the session's terminal buffer automatically re-attaches to a live terminal: xterm created, WS opened, scrollback replayed, input working.
- The exact terminal tab the user had open is restored (per-session, via `localStorage`), falling back to the first `active` terminal.
- Terminal lifetime is bound to (a) mimo-agent process lifetime and (b) explicit DELETE — never to browser attachment.
- Terminal I/O counts as session activity for idle purposes; a session with live terminals is not idle-parked/TTL-deleted merely because no browser is attached.

**Non-Goals:**

- Durable scrollback across platform restarts (accepted: process survives, replay starts empty).
- Terminals surviving an agent restart (accepted: they die with the agent).
- tmux/screen-based reattach after agent restart.
- Any protocol or REST API changes.

## Decisions

### D1: Fix re-attach in the frontend init path, not the server

On `init()`, after `refreshTerminals()` resolves, pick the target terminal and call the existing `switchToTerminal(id)`. The server-side replay path already works — no backend change needed for re-attach.

- Selection order: `localStorage["mimo.terminal.active.<sessionId>"]` if it still exists and is not `dead` → else first terminal with `state === "active"` → else none (show empty state).
- `switchToTerminal()` and `handleDeleteTerminal()` update the `localStorage` key (delete clears it when the active terminal is removed).
- Alternative considered: server-side "last active terminal" field in the session record → rejected; per-browser preference is client state, `localStorage` is sufficient and avoids API/repository changes.

### D2: Terminal activity resets the agent-side idle timer

mimo-agent already resets the session idle timer on prompt activity. Extend the same reset to terminal activity:

- On `terminal_spawn`, `terminal_input`, and terminal stdout forwarding, call the lifecycle manager's existing reset for that session (same code path used after prompt activity).
- Rationale: a user typing in a terminal is unambiguous session activity; without this, a long terminal-only session gets its ACP threads parked mid-work.

### D3: Live terminals veto park/TTL, not just extend the timer

- **Agent park path**: before `parkAllSessionThreads(sessionId)` runs, check `terminalProcesses` for any live process belonging to that session; if any exist, skip parking and restart the idle timer. Parking with a running shell would leave the terminal alive but the session in a confusing half-parked state.
- **Platform TTL sweep**: the TTL auto-delete evaluation skips sessions having at least one terminal with `state === "active"`. Deleting such a session would orphan the user's running processes without consent.
- Alternative considered: only reset timers on I/O (D2) without a veto → rejected; a quiet-but-important background process (e.g. a dev server producing no output) would still let the session be parked/deleted.

### D4: No server-side change for scrollback or replay

The existing `TerminalOutputBuffer` replay on WS open is reused as-is. No persistence, no size changes.

## Risks / Trade-offs

- [Terminal running a noisy process keeps the session unparked indefinitely] → Acceptable per requirement #4 (live terminal = busy session); user can delete the terminal or set `idleTimeoutMs: 0` semantics unchanged. Documented behavior change.
- [`localStorage` key staleness across browsers] → Per-browser restore is a UX nicety, not correctness; fallback to first active terminal covers mismatches.
- [Terminal stdout flood resetting idle timer constantly] → Reset is a cheap `clearTimeout`/`setTimeout`; output flood means the session genuinely is active.
- [TTL veto hides sessions from cleanup forever if a terminal is forgotten] → Terminal dies with its agent, and `terminal_exited` marks it `dead`, restoring TTL eligibility; explicit session delete remains available.

## Open Questions

- None blocking. (Exact TTL sweep integration point will be confirmed against the in-progress `session-ttl-auto-delete` change during implementation.)
