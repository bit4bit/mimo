## Why

ACP processes (claude-agent, opencode) can use external MCP servers for additional tools. Currently, any MCP server must be registered globally and is accessible by any session. There is no way to expose platform capabilities (like controlling the UI) to ACPs in an isolated, per-session way.

This change introduces a platform-hosted MCP HTTP endpoint that ACPs can call to interact with the platform from within a session. The endpoint is secured by a session-scoped token, so only ACPs belonging to a specific session can use it. The first tool provided is `open_file`, which opens a file in the EditBuffer — letting ACP-driven workflows surface files directly to the user's editor view without manual navigation.

## What Changes

- Add a `mcpToken` field (UUID) to the `Session` record, generated once at session creation
- Expose an MCP-protocol HTTP endpoint on the platform: `POST /api/mimo-mcp`
- Validate the Bearer token on every request; extract `sessionId` from the token
- Implement `open_file(path)` tool: validates the path is within the session workspace, then broadcasts `open_file_in_editbuffer` via WebSocket to the session's UI clients
- Include the MCP server config (URL + Authorization header) in the `session_ready` message sent to mimo-agent, so ACPs automatically have access
- Handle the `open_file_in_editbuffer` WS message in EditBuffer's JS to load the file via the existing files API

## Capabilities

### New Capabilities
- `platform-mcp-server`: Platform-hosted MCP HTTP endpoint, authenticated per session, exposing platform tools to ACPs

### Modified Capabilities
- `session-management`: Sessions gain a `mcpToken` field generated at creation; the `session_ready` message includes the MCP server config

## Impact

- Modified: `packages/mimo-platform/src/sessions/repository.ts` (add `mcpToken` field to `Session`)
- New: `packages/mimo-platform/src/mcp/server.ts` (MCP HTTP endpoint handler)
- New: `packages/mimo-platform/src/mcp/token-store.ts` (token → sessionId lookup)
- Modified: platform `index.ts` / server wiring (register MCP route, inject dependencies)
- Modified: `session_ready` message construction (append MCP server config to `mcpServers`)
- Modified: EditBuffer JS (handle `open_file_in_editbuffer` WS event)
- No breaking changes to existing MCP server management or ACP protocol
