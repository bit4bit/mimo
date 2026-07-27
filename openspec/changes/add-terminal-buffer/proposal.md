## Why

Users currently have no way to run shell commands interactively against the session's working directory from within the mimo-platform UI. They must leave the platform to run `git`, build commands, or inspect files in a terminal. Adding an interactive terminal buffer — surfaced as a new left-frame tab right after Chat — lets users work in the same checkout the agent operates in, with full scrollback history, without context-switching to an external terminal.

## What Changes

- Add a new **Terminal** buffer registered in the left frame, positioned immediately after the Chat tab
- Support creating a new terminal via a dialog that prompts for: name, agent (which connected mimo-agent instance hosts the shell), working folder (subpath relative to the repository root, reusing the `agentSubpath` concept), and scrollback history length
- Support deleting a terminal (kills the underlying shell process and removes persisted state)
- Spawn the shell process inside the selected mimo-agent, using the session's git checkout path plus the optional per-terminal subpath as the working directory
- Stream stdin/stdout bidirectionally between the browser and the agent-side shell over WebSocket
- Render terminal output using **xterm.js** with scrollback support so users can scroll through history
- Persist terminal metadata (id, name, agent, subpath, scrollback) in `session.yaml` alongside chat threads
- Add new platform↔agent WebSocket protocol messages for terminal lifecycle (spawn, input, output, resize, kill, exited)
- Add a new browser↔platform WebSocket connection type (`/ws/terminal/:sessionId/:terminalId`) for bidirectional terminal data

## Capabilities

### New Capabilities

- `terminal-management`: Create, list, and delete terminal entities scoped to a session; persist terminal metadata in `session.yaml`; select which agent hosts the shell and which subpath to use as working directory
- `terminal-streaming`: Bidirectional streaming of stdin/stdout between browser and the agent-side shell process over WebSocket; xterm.js rendering with configurable scrollback; shell lifecycle (spawn, resize, kill) relayed through the platform↔agent protocol
- `terminal-buffer`: A new left-frame buffer displaying the active terminal's xterm.js instance, with a terminal list/selector for multiple terminals per session, registered after the Chat buffer

### Modified Capabilities

- `frame-buffers`: A new "Terminal" buffer is registered in the left frame, positioned second (after Chat); the buffer renders an xterm.js terminal panel and a terminal selector

## Impact

- **packages/mimo-platform/src/web/features/sessions/components/buffers/**: New `TerminalBuffer.tsx` component + registration in `index.ts`
- **packages/mimo-platform/src/domain/sessions/**: `Terminal` interface in `repository.ts`, `addTerminal`/`removeTerminal`/`listTerminals` methods, persistence in `session.yaml`
- **packages/mimo-platform/src/api/rest/sessions.ts** + **sessions/handlers.ts**: New internal API endpoints for terminal CRUD (`POST /:id/terminals`, `GET /:id/terminals`, `DELETE /:id/terminals/:terminalId`)
- **packages/mimo-platform/src/api/websocket/handlers.ts**: New `/ws/terminal/:sessionId/:terminalId` connection type bridging browser↔agent terminal data
- **packages/mimo-platform/src/domain/agents/message-router.ts**: Handle agent→platform `terminal_output`/`terminal_exited` messages; platform→agent `terminal_spawn`/`terminal_input`/`terminal_resize`/`terminal_kill` messages
- **packages/mimo-agent/src/index.ts**: Handle terminal protocol messages; spawn shell process via `OS.command.spawn` using `acpCwd` + per-terminal subpath; stream stdin/stdout over the agent WS
- **packages/mimo-platform/public/js/terminal.js**: New client-side module managing xterm.js instance, WS connection, and terminal UI
- **packages/mimo-platform/public/vendor/**: xterm.js + addons (fit, web-links) bundled as static assets
- **packages/mimo-platform/src/assets.ts**: Import terminal static assets for embedding in compiled binary
- **packages/mimo-platform/src/web/features/sessions/components/SessionDetailPage.tsx**: Pass terminal list and active terminal id as buffer props to the Terminal buffer
- **packages/mimo-platform/src/web/shared/components/Layout.tsx**: Include xterm.js script tags and terminal.js module
- **Dependencies**: Add `@xterm/xterm` and `@xterm/addon-fit` (browser-side, bundled as static assets — not runtime dependencies of the platform server)