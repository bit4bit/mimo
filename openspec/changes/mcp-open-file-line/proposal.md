## Why

The platform's internal MCP `open_file` tool currently opens a file in the EditBuffer at the top. When an agent references a specific location (e.g. `src/mcp/server.ts:138`), the user still has to scroll or search to find what the agent is pointing at. The EditBuffer already renders rows tagged with `data-line-number`, so the missing piece is end-to-end carrying a 1-based line number from the MCP call through to a centered scroll in the browser.

This change refines `open_file` to optionally accept a `line` argument. The existing one-tool surface and behavior for line-less calls are preserved.

## What Changes

- Extend the `open_file` tool input schema with an optional `line: integer (>= 1)` field
- MCP server `tools/call open_file` handler forwards `line` (when present and valid) into the WebSocket broadcast payload `open_file_in_editbuffer`
- Server-side validation: reject only obvious garbage — non-integer or `< 1`. Do not validate against the file's `lineCount` (avoid second read; browser clamps gracefully).
- WebSocket payload `open_file_in_editbuffer` gains an optional `line` field
- EditBuffer client: after `fetchAndAddFile` callback, if `line` was provided, scroll the matching `tr[data-line-number="N"]` into view centered. If the row isn't found (file shorter than `line`), no-op.
- No flashing, no highlight, no persistent selection — just center-scroll
- Path-only calls remain unchanged in every observable way (same broadcast shape minus `line`, same response, same scroll behavior)
- **Breaking**: None. `line` is optional; absent calls behave identically to today.

## Capabilities

### Modified Capabilities

- `platform-mcp-server`: `open_file` tool input schema and broadcast payload gain an optional `line` field; the EditBuffer scrolls the target line into view when present.

## Impact

- Modified: `packages/mimo-platform/src/mcp/server.ts` — extend `tools/list` schema; parse and forward `line` in `tools/call open_file`; include `line` in both `chatSessions` and `fileWatchSessions` broadcasts when valid.
- Modified: `packages/mimo-platform/public/js/edit-buffer.js` — `open_file_in_editbuffer` handler reads optional `line`, scrolls target row into view (centered) inside the `fetchAndAddFile` callback after tab-switch.
- Modified: `packages/mimo-platform/test/mcp-server-routes.test.ts` — add scenarios for `line` forwarding and validation.
- No changes to: ACP protocol, session_ready MCP config injection, `mcpToken` plumbing, file API.
