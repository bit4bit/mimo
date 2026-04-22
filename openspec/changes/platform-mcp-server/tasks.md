## 1. Session MCP Token

- [x] 1.1 Add `mcpToken: string` field to `Session` interface in `packages/mimo-platform/src/sessions/repository.ts`
- [x] 1.2 Generate a UUID for `mcpToken` in the session creation path (use `crypto.randomUUID()`)
- [x] 1.3 Persist `mcpToken` in the session YAML serialization/deserialization
- [x] 1.4 Write integration test: session created → `mcpToken` is a non-empty UUID
- [x] 1.5 Write integration test: session loaded from YAML → `mcpToken` is preserved
- [x] 1.6 Run tests and ensure they pass

## 2. Token Store

- [x] 2.1 Create `packages/mimo-platform/src/mcp/token-store.ts` with a `McpTokenStore` class
- [x] 2.2 Implement `register(token, sessionId)` to add a token → sessionId mapping
- [x] 2.3 Implement `resolve(token): string | null` to look up a sessionId by token
- [x] 2.4 Implement `revoke(token)` to remove a mapping (called on session deletion)
- [x] 2.5 Write unit tests for register, resolve, and revoke
- [x] 2.6 Wire `McpTokenStore` into platform startup: populate from all loaded sessions
- [x] 2.7 Wire revoke into session deletion path
- [x] 2.8 Run tests and ensure they pass

## 3. MCP HTTP Endpoint

- [x] 3.1 Create `packages/mimo-platform/src/mcp/server.ts` with a Hono router factory `createMcpRoutes`
- [x] 3.2 Implement Bearer token extraction from `Authorization` header; return 401 if missing or unresolved
- [x] 3.3 Implement MCP protocol: handle `initialize` and `tools/list` requests, returning the `open_file` tool schema
- [x] 3.4 Implement `tools/call` dispatch for `open_file`
- [x] 3.5 In `open_file` handler: validate path is within session workspace using `FileService`
- [x] 3.6 In `open_file` handler: call `broadcastToSession` with `{ type: "open_file_in_editbuffer", sessionId, path }`
- [x] 3.7 Return `{ success: true, path }` on success; structured error on failure
- [x] 3.8 Register the MCP router at `/api/mimo-mcp` in the platform server wiring
- [x] 3.9 Write integration test: valid token + valid path → 200 + broadcast sent
- [x] 3.10 Write integration test: missing token → 401
- [x] 3.11 Write integration test: path outside workspace → error result (not 401)
- [x] 3.12 Write integration test: nonexistent file → error result
- [x] 3.13 Run tests and ensure they pass

## 4. session_ready MCP Config Injection

- [x] 4.1 Locate where `session_ready` payload is constructed (platform WebSocket handler)
- [x] 4.2 Append the platform MCP server config to the `mcpServers` array using the session's `mcpToken`
- [x] 4.3 Config format: `{ type: "http", name: "mimo", url: "{platformUrl}/api/mimo-mcp", headers: [{ name: "Authorization", value: "Bearer {mcpToken}" }] }`
- [x] 4.4 Write integration test: `session_ready` message contains the platform MCP config entry
- [x] 4.5 Write integration test: after agent restart, same `mcpToken` is present in `session_ready`
- [x] 4.6 Run tests and ensure they pass

## 5. EditBuffer: Handle open_file_in_editbuffer

- [x] 5.1 In the EditBuffer client-side JS, add a handler for WS messages of type `open_file_in_editbuffer`
- [x] 5.2 On receiving the message, call the existing file-load function with the provided `path`
- [x] 5.3 Ensure the EditBuffer frame becomes visible/focused when the file is opened via MCP
- [x] 5.4 Write a test (or manual verification step) confirming the file opens in the editor

## 6. Migration Script: Sync Existing Sessions

- [x] 6.1 Create `packages/mimo-platform/scripts/sync-session-mcp-tokens.ts`
- [x] 6.2 Script loads all session YAML files from the sessions directory
- [x] 6.3 For each session missing `mcpToken`, generate a UUID and write it back to the YAML file
- [x] 6.4 Print a summary: how many sessions updated, how many already had a token
- [x] 6.5 Write test: script is idempotent — running twice does not change tokens already set
- [x] 6.6 Run tests and ensure they pass

## 7. Integration and Verification

- [x] 7.1 Run all existing tests: `cd packages/mimo-platform && bun test`
- [x] 7.2 Run all existing tests: `cd packages/mimo-agent && bun test`
- [x] 7.3 Verify end-to-end: ACP calls `open_file` → file appears in EditBuffer
- [x] 7.4 Verify restart resilience: restart mimo-agent → ACP reconnects → `open_file` still works
- [x] 7.5 Verify isolation: token from session A cannot open files in session B (returns 401)
- [x] 7.6 Run migration script against existing sessions; verify tokens are set and platform starts cleanly
