# Tasks: persistent-terminals

## 1. Frontend: auto-reattach on page load

- [x] 1.1 Write a failing test (or manual verification script) capturing current behavior: page load with existing terminals does not open a terminal WebSocket
- [x] 1.2 Add `localStorage` helpers in `packages/mimo-platform/public/js/terminal.js`: get/set/clear active terminal id keyed by session id (`mimo.terminal.active.<sessionId>`)
- [x] 1.3 Update `init()` to await `refreshTerminals()`, then resolve the re-attach target: stored id if it exists and is not `dead`, else first terminal with `state === "active"`, else none; call `switchToTerminal(targetId)` when a target exists
- [x] 1.4 Update `switchToTerminal()` to persist the selected terminal id on every switch
- [x] 1.5 Update `handleDeleteTerminal()` to clear the stored id when the deleted terminal was the stored selection
- [ ] 1.6 Verify manually: create terminal, type in it, reload page → same terminal reopens, scrollback replayed, input works; multi-tab case restores exact tab

## 2. Agent: terminal activity resets idle timer

- [x] 2.1 Write a failing unit test in `packages/mimo-agent` asserting terminal input/output triggers the session idle-timer reset
- [x] 2.2 In `packages/mimo-agent/src/index.ts`, invoke the lifecycle manager's existing idle-timer reset for the session on `terminal_spawn`, `terminal_input`, and terminal stdout forwarding
- [x] 2.3 Run `cd packages/mimo-agent && bun test`

## 3. Agent: live terminals veto parking

- [x] 3.1 Write a failing unit test: when the session idle timer fires and a live terminal process exists for the session, parking is skipped and the timer restarts
- [x] 3.2 In the park path (`lifecycle.ts` `parkAllSessionThreads` trigger or its caller), check for live terminal processes for the session (via `terminalProcesses`) before parking; skip and restart the timer when any exist
- [x] 3.3 Run `cd packages/mimo-agent && bun test`

## 4. Platform: TTL auto-delete veto for active terminals

- [x] 4.1 Locate the TTL auto-delete evaluation (see `session-ttl-auto-delete` change) and write a failing test: a TTL-expired session with an `active` terminal is not deleted
- [x] 4.2 Add the veto: skip TTL deletion for sessions with at least one terminal in state `active`
- [x] 4.3 Run `cd packages/mimo-platform && bun test`

## 5. Verification

- [x] 5.1 Run full suites: `cd packages/mimo-platform && bun test` and `cd packages/mimo-agent && bun test`
- [ ] 5.2 End-to-end manual check: create terminal → run a long process → close browser entirely → reopen → terminal re-attached and process still running; confirm session is not parked/TTL-deleted while the terminal lives
