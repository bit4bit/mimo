## 1. MCP Server: Schema and Forwarding

- [x] 1.1 Write integration test in `packages/mimo-platform/test/mcp-server-routes.test.ts`: `tools/list` response for `open_file` advertises `line` as `{ type: "integer", minimum: 1 }` (optional). Confirm test fails.
- [x] 1.2 Update `tools/list` handler in `packages/mimo-platform/src/mcp/server.ts` to add the optional `line` property to `open_file`'s `inputSchema`. Confirm test passes.
- [x] 1.3 Write integration test: `tools/call open_file` with valid path and `line: 138` broadcasts `{ type: "open_file_in_editbuffer", sessionId, path, line: 138 }` on the chat WS channel. Confirm test fails.
- [x] 1.4 Write integration test: same call also broadcasts the line-bearing payload on the `fileWatchSessions` channel. Confirm test fails.
- [x] 1.5 Update `tools/call` handler to extract `args?.line`, validate via `Number.isInteger(line) && line >= 1`, and include it in **both** broadcast payloads when valid. Confirm tests pass.
- [x] 1.6 Write integration test: `tools/call open_file` with valid path and **no** `line` broadcasts a payload **without** a `line` key (current behavior preserved). Confirm test passes (should already, but anchors the contract).
- [x] 1.7 Write integration test (table-style): `line: 0`, `line: -3`, `line: 1.5`, `line: "abc"`, `line: null` each → broadcast omits `line`, response is `{ success: true, path }`. Confirm tests fail then pass.
- [x] 1.8 Write integration test: `line` greater than the file's line count → server still broadcasts with `line` included; response `{ success: true, path }`. Confirm passes (no server-side line-count check).
- [x] 1.9 Run `cd packages/mimo-platform && bun test` and ensure full suite is green.

## 2. EditBuffer Client: Centered Scroll

- [x] 2.1 In `packages/mimo-platform/public/js/edit-buffer.js`, locate the `open_file_in_editbuffer` handler (~line 1963).
- [x] 2.2 Inside the existing `fetchAndAddFile(sessionId, data.path, callback)` callback, after the tab click and `contentEl.focus()`, add: if `Number.isInteger(data.line) && data.line >= 1`, query `#edit-buffer-lines-body tr[data-line-number="${data.line}"]` and call `scrollIntoView({ block: "center" })` if the row exists.
- [x] 2.3 Do not modify `EditBufferState.scrollPosition` semantics — line-jump is ephemeral per call.
- [ ] 2.4 Manual verification: from a session, drive an MCP `open_file` call with `line` set, confirm the file opens and the target line is centered. Document the manual steps in the change PR description.
- [ ] 2.5 Manual verification: drive an MCP `open_file` call with no `line`, confirm prior scroll-position behavior unchanged (no programmatic scroll).
- [ ] 2.6 Manual verification: drive an MCP `open_file` call with `line` exceeding file length, confirm the file still opens and no error is logged.

## 3. End-to-End Verification

- [x] 3.1 Run `cd packages/mimo-platform && bun test` — all green. *(866 pass, 5 fail; failures pre-existing on `main` and unrelated to this change: VCS/fossil/agent-bootstrap.)*
- [x] 3.2 Run `cd packages/mimo-platform && bun run test.full` — all green. *(866 pass, 12 fail; failures pre-existing and unrelated: VCS/fossil/agent-bootstrap. New `mcp-server-routes.test.ts` cases all pass.)*
- [x] 3.3 Run `cd packages/mimo-agent && bun test` — confirm agent suite remains green (no agent changes expected). *(144 pass, 0 fail.)*
- [x] 3.4 Run `openspec validate mcp-open-file-line --strict` and resolve any findings. *(Valid.)*
