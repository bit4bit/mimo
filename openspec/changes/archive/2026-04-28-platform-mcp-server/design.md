## Context

The platform already has:
- `McpServerConfig` type with `headers` support — token delivery is free
- `broadcastToSession` — for pushing messages to UI WebSocket clients
- `GET /api/sessions/:id/files/content` — EditBuffer already uses this to load files
- `EditBuffer.tsx` — file editor registered as buffer `"edit"` in the left frame
- `FileService.readFile` — already enforces workspace path boundary
- `session_ready` message — already carries `mcpServers: McpServerConfig[]` to mimo-agent

The mimo-agent passes `mcpServers` directly to `acpClient.initialize()`, so any config injected into `session_ready` is automatically used by the ACP.

## Goals / Non-Goals

**Goals:**
- Platform-hosted MCP endpoint, secure and per-session
- Token generated once at session creation, stable across agent restarts
- `open_file` tool triggers EditBuffer to show a file to the user
- Zero coordination needed on agent restart (platform is always up)

**Non-Goals:**
- Per-thread MCP isolation (session-level is sufficient)
- MCP tool for writing/editing files (read/open only for now)
- Exposing the platform MCP to users as a configurable MCP server
- Support for stdio or SSE transport (HTTP only)

## Decisions

### Decision 1: Token is a UUID, generated once at session creation
**Rationale**: Simple, stable, no expiry needed. The token is only transmitted over the already-authenticated agent WebSocket channel. Rotation would require ACP reconnect to MCP on every agent restart with no security benefit.

**Alternatives considered:**
- JWT with sessionId claim: More complex, same security properties since channel is already authenticated
- Rotate on each `session_ready`: Adds reconnect overhead, no benefit

### Decision 2: Platform hosts the MCP endpoint at `/api/mimo-mcp`
**Rationale**: Platform is the stable process. Agent restarts are transparent — same URL, token reissued in `session_ready` headers, ACP reconnects to same endpoint with zero coordination.

**Alternatives considered:**
- stdio MCP subprocess per ACP: Can't communicate back to platform UI without IPC seam
- HTTP server on mimo-agent: Dies on agent restart; port management complexity

### Decision 3: Token → sessionId lookup via in-memory map on platform
**Rationale**: Sessions are loaded at startup from the YAML store. The map is rebuilt from session records (which persist `mcpToken`). Fast O(1) lookup on every MCP request.

**Token registration flow:**
```
platform start → load all sessions → populate token map
session create → generate UUID → store in Session.mcpToken → add to token map
session delete → remove from token map
```

### Decision 4: `open_file` broadcasts WS event; EditBuffer JS loads file via existing API
**Rationale**: Decoupled. The MCP handler doesn't need to know how the editor works — it just broadcasts `{ type: "open_file_in_editbuffer", sessionId, path }`. The EditBuffer JS already knows how to load files via `GET /api/sessions/:id/files/content`.

**Broadcast target:** `broadcastToSession(chatSessions, sessionId, message)` — existing utility, reaches all UI clients for the session.

### Decision 5: File path validated against session workspace before broadcast
**Rationale**: Defense in depth. The MCP handler must confirm the requested path is within the session's workspace before opening it in the UI, using the same boundary check already in `FileService.readFile`.

## Architecture

```
Platform                                              UI
────────────────────────────────────────────────────────
Session.mcpToken (UUID, generated at creation)
  └─ included in session_ready → mimo-agent → ACP
  └─ stored in token map: mcpToken → sessionId

POST /api/mimo-mcp  ←── ACP MCP client call
  1. Extract Bearer token
  2. Lookup sessionId in token map
  3. Validate path within workspace
  4. broadcastToSession → { type: "open_file_in_editbuffer", path }
                                    ──────────────────────────────────→ EditBuffer JS
                                                                           → fetch /api/sessions/:id/files/content
                                                                           → render file in editor
  5. Return MCP tool result: { success: true }
```

## MCP Protocol

The endpoint implements the MCP streamable HTTP transport (single POST endpoint).

**Tool definition:**
```json
{
  "name": "open_file",
  "description": "Open a file in the platform editor (EditBuffer) for the current session",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Relative path to the file within the session workspace"
      }
    },
    "required": ["path"]
  }
}
```

**McpServerConfig injected in session_ready:**
```json
{
  "type": "http",
  "name": "mimo",
  "url": "http://localhost:{PORT}/api/mimo-mcp",
  "headers": [
    { "name": "Authorization", "value": "Bearer {mcpToken}" }
  ]
}
```

## Risks / Trade-offs

**[Risk] Token exposed in session_ready WebSocket message**
→ Mitigation: session_ready is sent over the existing authenticated WebSocket (JWT-validated). The channel is already trusted.

**[Risk] In-memory token map lost on platform restart**
→ Mitigation: map is rebuilt from persisted session YAML files on startup. No data loss.

**[Risk] MCP endpoint receives requests from outside the agent channel**
→ Mitigation: Token is required and validated on every request. No token = 401. Token is single-use per session and only transmitted via the authenticated WebSocket.

**[Trade-off] Session-level isolation (not thread-level)**
→ Accepted: All threads in a session share the workspace. Opening a file in the EditBuffer is a session-level UI action anyway.
