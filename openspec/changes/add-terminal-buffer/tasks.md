## 1. Domain Model & Persistence

- [x] 1.1 Write failing integration test: creating a terminal persists it in `session.yaml` with `id`, `name`, `assignedAgentId`, `subpath`, `scrollback`, `state: "active"`, `createdAt`
- [x] 1.2 Write failing integration test: listing terminals for a session returns all persisted terminals
- [x] 1.3 Write failing integration test: deleting a terminal removes it from `session.yaml`
- [x] 1.4 Write failing integration test: creating a terminal without subpath sets the shell cwd to checkout root
- [x] 1.5 Add `Terminal` interface to `packages/mimo-platform/src/domain/sessions/repository.ts`
- [x] 1.6 Add `terminals: Terminal[]` field to the `Session` interface
- [x] 1.7 Implement `addTerminal`, `removeTerminal`, `listTerminals` methods in the session repository
- [x] 1.8 Ensure `session.yaml` serialization includes the `terminals` collection
- [x] 1.9 Run tests and confirm they pass

## 2. Internal API Endpoints

- [x] 2.1 Write failing integration test: `POST /sessions/:id/terminals` creates a terminal and returns it
- [x] 2.2 Write failing integration test: `POST /sessions/:id/terminals` returns 400 when `name` or `assignedAgentId` is missing
- [x] 2.3 Write failing integration test: `POST /sessions/:id/terminals` returns 400 when the assigned agent is not online
- [x] 2.4 Write failing integration test: `GET /sessions/:id/terminals` returns the terminal list
- [x] 2.5 Write failing integration test: `DELETE /sessions/:id/terminals/:terminalId` removes the terminal and returns 200
- [x] 2.6 Write failing integration test: `DELETE /sessions/:id/terminals/:terminalId` returns 404 for non-existent terminal
- [x] 2.7 Add terminal routes to `packages/mimo-platform/src/api/rest/sessions.ts` (POST, GET, DELETE)
- [x] 2.8 Add `addTerminalHandler`, `listTerminalsHandler`, `deleteTerminalHandler` to `packages/mimo-platform/src/api/rest/sessions/handlers.ts`
- [x] 2.9 Validate required fields and agent online status in create handler
- [x] 2.10 Wire `terminal_kill` message dispatch to agent on terminal deletion
- [x] 2.11 Run tests and confirm they pass

## 3. Web Route Proxies

- [x] 3.1 Write failing integration test: `POST /sessions/:id/terminals` (web route, cookie auth) proxies to internal API and returns the created terminal
- [x] 3.2 Write failing integration test: `GET /sessions/:id/terminals` (web route) returns terminals for the session
- [x] 3.3 Write failing integration test: `DELETE /sessions/:id/terminals/:terminalId` (web route) proxies to internal API
- [x] 3.4 Add terminal proxy routes to `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx`
- [x] 3.5 Run tests and confirm they pass

## 4. Platform↔Agent WebSocket Protocol

- [x] 4.1 Write failing integration test: creating a terminal sends `terminal_spawn` message to the assigned agent
- [x] 4.2 Write failing integration test: deleting a terminal sends `terminal_kill` message to the assigned agent
- [x] 4.3 Write failing integration test: agent `terminal_output` messages are forwarded to the browser terminal WebSocket
- [x] 4.4 Write failing integration test: agent `terminal_exited` messages update terminal state to `"dead"` and notify the browser
- [x] 4.5 Add `terminal_spawn`, `terminal_input`, `terminal_kill` message handling to `packages/mimo-platform/src/domain/agents/service.ts` (`sendToAgent`)
- [x] 4.6 Add `terminal_output`, `terminal_exited`, `terminal_spawned` cases to `packages/mimo-platform/src/domain/agents/message-router.ts`
- [x] 4.7 Implement browser terminal WS bridge: forward browser binary stdin frames as `terminal_input` (base64) to the agent; forward agent `terminal_output` (base64) as binary frames to the browser
- [x] 4.8 Implement terminal exit handling: update terminal state, notify browser WebSocket
- [x] 4.9 Run tests and confirm they pass

## 5. Browser↔Platform Terminal WebSocket

- [x] 5.1 Write failing integration test: `/ws/terminal/:sessionId/:terminalId` accepts a valid cookie-authenticated connection
- [x] 5.2 Write failing integration test: `/ws/terminal/:sessionId/:terminalId` rejects unauthenticated requests with 401
- [x] 5.3 Write failing integration test: `/ws/terminal/:sessionId/:terminalId` rejects non-owner users with 401
- [x] 5.4 Add `terminal` connection type to `createWebSocketSetup` in `packages/mimo-platform/src/api/websocket/handlers.ts`
- [x] 5.5 Parse `sessionId` and `terminalId` from the path `/ws/terminal/:sessionId/:terminalId`
- [x] 5.6 Store terminal WebSocket connections keyed by `sessionId:terminalId`
- [x] 5.7 Run tests and confirm they pass

## 6. Agent-Side Terminal Process Management

- [x] 6.1 Write failing integration test: agent spawns a shell process on `terminal_spawn` with cwd at checkout root (no subpath)
- [x] 6.2 Write failing integration test: agent spawns a shell process on `terminal_spawn` with cwd at `{checkoutPath}/{subpath}`
- [x] 6.3 Write failing integration test: agent writes `terminal_input` data to the shell's stdin
- [x] 6.4 Write failing integration test: agent streams shell stdout as `terminal_output` messages
- [x] 6.5 Write failing integration test: agent kills the shell on `terminal_kill` and sends `terminal_exited`
- [x] 6.6 Write failing integration test: agent sends `terminal_exited` when the shell exits naturally
- [x] 6.7 Add `terminal_spawn`, `terminal_input`, `terminal_kill` message cases to `handleMessage` switch in `packages/mimo-agent/src/index.ts`
- [x] 6.8 Implement shell spawn logic using `OS.command.spawn` with cwd = `acpCwd [+ subpath]`, shell = `$SHELL || "/bin/sh"`
- [x] 6.9 Track active terminal processes in a `Map<terminalId, SpawnedProcess>`
- [x] 6.10 Stream stdout chunks as base64-encoded `terminal_output` messages
- [x] 6.11 Write stdin from `terminal_input` decoded base64 to the shell's `stdin` WritableStream
- [x] 6.12 Send `terminal_spawned` confirmation on successful spawn
- [x] 6.13 Handle shell exit: send `terminal_exited` with exit code, clean up process map
- [x] 6.14 Run tests and confirm they pass

## 7. Terminal Buffer UI Component

- [x] 7.1 Write failing integration test: the Terminal tab appears in the left frame after Chat and before Edit
- [x] 7.2 Write failing integration test: the Terminal buffer shows an empty state when no terminals exist
- [x] 7.3 Write failing integration test: the Terminal buffer shows a terminal selector when terminals exist
- [x] 7.4 Write failing integration test: the "New Terminal" button is visible in the Terminal buffer
- [x] 7.5 Create `packages/mimo-platform/src/web/features/sessions/components/buffers/TerminalBuffer.tsx`
- [x] 7.6 Register the `terminal` buffer in `packages/mimo-platform/src/web/features/sessions/components/buffers/index.ts` after `chat` and before `edit`
- [x] 7.7 Render terminal selector (dropdown/list) with "New Terminal" button in the buffer header
- [x] 7.8 Render empty state message when no terminals exist
- [x] 7.9 Render xterm.js container div (`id="terminal-xterm-container"`) in the buffer content area
- [x] 7.10 Pass `terminals` and `activeTerminalId` as buffer props from `SessionDetailPage.tsx`
- [x] 7.11 Run tests and confirm they pass

## 8. New Terminal Dialog UI

- [x] 8.1 Write failing integration test: the new terminal dialog shows a name input, agent selector, subpath input, and scrollback field
- [x] 8.2 Write failing integration test: the agent selector is populated with online agents only and does not allow "None"
- [x] 8.3 Write failing integration test: the scrollback field defaults to 1000
- [x] 8.4 Write failing integration test: submitting without a name or agent shows a validation error
- [x] 8.5 Write failing integration test: submitting valid data creates a terminal via the API
- [x] 8.6 Create the "New Terminal" dialog in `packages/mimo-platform/public/js/terminal.js`
- [x] 8.7 Populate agent selector from the online agents list (reuse pattern from `chat-threads.js`)
- [x] 8.8 Add subpath text input (optional) and scrollback number input (default 1000)
- [x] 8.9 Validate required fields before submitting
- [x] 8.10 POST to `/sessions/:id/terminals` on submit
- [x] 8.11 Run tests and confirm they pass

## 9. xterm.js Client Integration

- [x] 9.1 Write failing integration test: `terminal.js` initializes an xterm.js instance with the configured scrollback when the Terminal buffer becomes active
- [x] 9.2 Write failing integration test: `terminal.js` opens a WebSocket to `/ws/terminal/:sessionId/:terminalId` and writes received binary data to xterm
- [x] 9.3 Write failing integration test: user keyboard input is sent as binary frames over the terminal WebSocket
- [x] 9.4 Write failing integration test: when the terminal buffer becomes inactive, the xterm instance and WebSocket are disposed
- [x] 9.5 Download xterm.js core, fit addon, and CSS to `packages/mimo-platform/public/vendor/xterm/`
- [x] 9.6 Add xterm.js asset imports to `packages/mimo-platform/src/assets.ts` with `with { type: "file" }`
- [x] 9.7 Add xterm.js `<script>` and `<link>` tags to `packages/mimo-platform/src/web/shared/components/Layout.tsx`
- [x] 9.8 Implement `public/js/terminal.js`: initialize xterm `Terminal` with scrollback from terminal config
- [x] 9.9 Open WebSocket to `/ws/terminal/:sessionId/:terminalId`, pipe binary frames to `terminal.write()`
- [x] 9.10 Pipe `terminal.onData()` to the WebSocket as binary frames
- [x] 9.11 Handle terminal exit: display exit message in xterm, close WebSocket
- [x] 9.12 Handle buffer activation/deactivation: init/dispose xterm + WebSocket
- [x] 9.13 Run tests and confirm they pass

## 10. Terminal Deletion UI

- [x] 10.1 Write failing integration test: deleting a terminal via the UI removes it from the selector and kills the shell
- [x] 10.2 Add a delete button to each terminal entry in the selector
- [x] 10.3 DELETE to `/sessions/:id/terminals/:terminalId` on delete button click
- [x] 10.4 Remove the terminal from the selector and dispose its xterm instance
- [x] 10.5 Run tests and confirm they pass

## 11. Session Detail Page Wiring

- [x] 11.1 Write failing integration test: `SessionDetailPage` loads terminals from the session and passes them as buffer props
- [x] 11.2 Load terminals from the session repository in `SessionDetailPage.tsx`
- [x] 11.3 Pass `terminals` and `activeTerminalId` to the Terminal buffer via `bufferProps`
- [x] 11.4 Add `terminal.js` to the Layout script includes
- [x] 11.5 Run tests and confirm they pass

## 12. Terminal Size (cols/rows)

- [x] 12.1 Write failing integration test: creating a terminal persists `cols`/`rows` in `session.yaml`; defaults to 80x24 when omitted
- [x] 12.2 Write failing integration test: `terminal_spawn` message includes `cols`/`rows`
- [x] 12.3 Write failing integration test: `POST /sessions/:id/terminals` returns 400 for non-positive-integer `cols`/`rows`
- [x] 12.4 Write failing integration test: agent applies `cols`/`rows` to the shell's terminal size at spawn (verified via `stty size`)
- [x] 12.5 Add `cols`/`rows` to the `Terminal` interface, `addTerminal`, and `normalizeTerminals` (default 80x24)
- [x] 12.6 Validate `cols`/`rows` in the create handler and include them in `terminal_spawn`
- [x] 12.7 Agent spawn sets terminal size via `stty cols <cols> rows <rows>` before exec'ing the command
- [x] 12.8 Add columns/rows inputs to the New Terminal dialog, prefilled from the fit addon's proposed dimensions
- [x] 12.9 Initialize xterm with the terminal's stored `cols`/`rows`
- [x] 12.10 Run tests and confirm they pass

## 13. Final Verification

- [x] 13.1 Run `bun test` in `packages/mimo-platform` and confirm all tests pass
- [x] 13.2 Run `bun test` in `packages/mimo-agent` and confirm all tests pass
- [x] 13.3 Run `bun run test.full` in both packages and confirm the full suite passes
- [x] 13.4 Manually verify: create a terminal, type commands, see output, scroll back, delete the terminal
- [x] 13.5 Verify xterm.js assets are embedded correctly in the compiled binary (`bun build --compile`)