## Context

The mimo-platform renders a session page with two frames (left/right), each containing switchable "buffer" tabs. The left frame currently hosts Chat, Edit, and Patches. There is no interactive shell capability — users cannot run commands in the session's working directory from the UI.

The platform communicates with connected mimo-agent instances over a single WebSocket (`/ws/agent?token=`) using JSON messages. The browser communicates with the platform over separate cookie-authenticated WebSockets (`/ws/chat/:sessionId`, `/ws/files/:sessionId`). The agent already computes a working directory (`acpCwd = checkoutPath [+ agentSubpath]`) for ACP processes — the same checkout/subpath concept applies to terminals.

Key constraints:
- **No native modules**: the release workflow cross-compiles single-file binaries via `bun build --compile`. Native N-API modules (e.g. `node-pty`) are incompatible with this workflow.
- **xterm.js is browser-side only**: it's a static JS asset served to the browser, not a runtime dependency of the platform server.
- **BDD workflow**: integration tests first, per `llms/core-engineering.md`.
- **DI/no-singletons**: all dependencies injected, `process.env` only in `index.ts`.

## Goals / Non-Goals

**Goals:**
- Add a Terminal buffer in the left frame, positioned second (after Chat, before Edit)
- Create/delete terminals scoped to a session, with a dialog prompting for name, agent, subpath, and scrollback length
- Spawn the shell inside the selected mimo-agent at `checkoutPath [+ subpath]`
- Bidirectional streaming of stdin/stdout between browser and agent over WebSocket
- xterm.js rendering with scrollback so users can scroll through output history
- Persist terminal metadata in `session.yaml`

**Non-Goals:**
- True PTY allocation (TIOCSWINSZ, raw mode) — pipe-based stdio is acceptable for v1; a PTY spike is a separate follow-up
- Terminal output persistence across page reloads (scrollback lives in xterm's in-memory buffer; no disk log in v1)
- Terminal resize after spawn (cols/rows are set at creation time — prefilled from the buffer's fit dimensions — and applied to the shell via `stty` at spawn; live resize is a follow-up)
- Multiple concurrent terminals per session in v1 UI (the data model supports it, but the buffer shows a single active terminal with a selector — full multi-terminal tab UI is a follow-up)
- Shell selection UI (uses the system default shell from `$SHELL` or `/bin/sh`)

## Decisions

### D1: Shell runs inside mimo-agent (not the platform)

**Decision:** The shell process is spawned by the agent via `OS.command.spawn`, using `acpCwd [+ terminal.subpath]` as working directory. Stdin/stdout are tunneled through the existing platform↔agent WS as JSON messages with base64-encoded data.

**Rationale:** The user requirement states "a terminal is spawned in the mimo-agent connected in the root project or relative the folder indicated." The agent already owns the git checkout and computes `acpCwd`. Spawning on the agent side keeps the shell lifecycle co-located with the ACP process, reuses the same working-directory logic, and ensures the shell sees the same filesystem state the agent operates on.

**Alternatives considered:**
- *Spawn on the platform*: the platform also has `agentWorkspacePath`, so it could spawn directly. Simpler (one fewer WS hop), but violates the requirement that the terminal runs in the agent. Also the platform may not have the same filesystem view in all deployment topologies.

### D2: Pipe-based stdio, not a true PTY

**Decision:** Use `OS.command.spawn` with pipe-based stdio (`["pipe", "pipe", "pipe"]`). The shell is invoked as `[$SHELL || "/bin/sh"]` with no TTY allocation.

**Rationale:** `node-pty` (the standard PTY library) is a native N-API module incompatible with `bun build --compile` cross-compilation. The pipe-based approach works with Bun's built-in `child_process.spawn`, produces streaming stdin/stdout, and supports xterm.js rendering. Programs that check `isatty` will behave differently (no colored prompts, no line editing in the shell itself — but xterm.js provides line editing on the client side), but this is an acceptable trade-off for v1.

**Alternatives considered:**
- *`script -qec <shell> /dev/null`*: fakes a PTY via the `script` utility. Could be layered on top of the pipe approach later without protocol changes — worth a spike but not a v1 blocker.
- *Bun-native PTY*: no stable Bun-compatible PTY library exists as of design time.
- *Accept `node-pty` and drop cross-compilation for the release*: violates a core constraint.

### D3: New browser↔platform WebSocket connection type

**Decision:** Add `/ws/terminal/:sessionId/:terminalId` as a third WS connection type alongside `/ws/chat/:sessionId` and `/ws/files/:sessionId`. Cookie-authenticated (same as chat/files). The platform bridges this WS to the agent WS by forwarding stdin messages to the agent and pushing agent stdout back to the browser.

```
Browser                  Platform                  Agent
   │                         │                        │
   │── WS /ws/terminal/ ────▶│                        │
   │   :sessionId/:terminalId│                        │
   │                         │── agent WS ───────────▶│
   │                         │   {type:"terminal_input",│
   │                         │    terminalId, data}    │
   │                         │                        │
   │◀── terminal_output ────│◀─ {type:"terminal_output",│
   │    (base64 data)        │    terminalId, data}    │
   │                         │                        │
```

**Rationale:** Mirrors the existing `chat` and `files` WS patterns. Keeps terminal data on a dedicated connection so it doesn't interfere with chat streaming. Cookie auth reuses the existing verification path.

**Alternatives considered:**
- *Multiplex terminal data over the existing `/ws/chat/:sessionId` connection*: avoids a new connection type but conflates two unrelated data streams and complicates the chat message router.

### D4: Base64 encoding for binary data over the agent WS

**Decision:** Terminal stdin/stdout data is base64-encoded inside JSON messages (`{type: "terminal_input", terminalId, data: "<base64>"}`) on the agent WS. The browser WS uses raw binary frames (xterm.js writes `Uint8Array`).

**Rationale:** The agent WS currently only handles JSON text frames (via the `ws` library). Adding binary frame support would require protocol changes across the entire message router. Base64 in JSON is the path of least resistance and keeps the agent WS handler uniform. The browser↔platform WS can use binary frames directly (the platform converts between binary browser frames and base64 JSON agent messages at the bridge point).

**Alternatives considered:**
- *Binary frames on the agent WS too*: more efficient but requires reworking the agent WS message dispatch to distinguish binary vs text frames.

### D5: Terminal data model in session.yaml

**Decision:** Add a `terminals: Terminal[]` field to the session model, persisted in `session.yaml` alongside `chatThreads`.

```typescript
interface Terminal {
  id: string;
  name: string;
  assignedAgentId: string;
  subpath?: string;       // relative to checkout root; undefined = root
  scrollback: number;      // xterm.js scrollback buffer size
  cols: number;            // terminal width in columns (default 80)
  rows: number;            // terminal height in rows (default 24)
  state: "active" | "dead";
  createdAt: string;      // ISO timestamp
}
```

**Rationale:** Mirrors the `ChatThread` pattern. The platform owns terminal metadata; the agent owns the running process. On agent reconnect, the platform sends terminal state via `session_ready` (extended) and the agent can optionally re-spawn dead terminals — but v1 does not auto-respawn.

### D6: Terminal buffer UI structure

**Decision:** The `TerminalBuffer` component renders:
1. A terminal selector dropdown/list at the top (if >0 terminals exist) with a "New Terminal" button
2. The xterm.js container div below, filling remaining space
3. An empty state when no terminals exist ("No terminals — create one to get started")

The xterm.js instance is initialized by `public/js/terminal.js` when the buffer becomes active. The buffer receives `terminals` and `activeTerminalId` as buffer props from `SessionDetailPage`.

**Rationale:** Follows the Chat buffer pattern (thread selector + content area). The xterm container is always present in the DOM but only initialized when the buffer is active to avoid wasted resources.

## Risks / Trade-offs

- **[No TTY → degraded shell experience]** Programs checking `isatty` won't show colors or interactive prompts. → *Mitigation*: v1 accepts this; document as known limitation. The `script` trick can be added later without protocol changes.
- **[Base64 overhead on agent WS]** ~33% size increase for terminal data. → *Mitigation*: acceptable for interactive shell volumes (KB/s, not MB/s). Can upgrade to binary frames later.
- **[Terminal orphaned on agent disconnect]** If the agent WS drops, the shell process is killed. The terminal metadata remains in `session.yaml` with `state: "dead"`. → *Mitigation*: v1 does not auto-respawn. User can delete and recreate. Auto-respawn is a follow-up.
- **[Multiple terminals, single xterm]** If the user switches active terminal, the xterm instance must be disposed and re-created for the new terminal (xterm can't multiplex). → *Mitigation*: `terminal.js` handles dispose/re-init on active terminal change. Scrollback of the previous terminal is lost on switch (in-memory only). Persisting scrollback is a follow-up.
- **[xterm.js bundle size]** xterm.js + addons add ~500KB to the static assets. → *Mitigation*: acceptable for a terminal feature; loaded as a vendor asset alongside existing highlight.js and marked.js.