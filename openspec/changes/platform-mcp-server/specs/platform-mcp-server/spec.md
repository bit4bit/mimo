## ADDED Requirements

### Requirement: Platform MCP HTTP Endpoint
The platform SHALL expose an MCP-protocol HTTP endpoint at `POST /api/mimo-mcp` that ACPs can call to interact with platform capabilities.

#### Scenario: Tool list discovery
- **WHEN** an ACP client sends an MCP initialize or tools/list request to `POST /api/mimo-mcp`
- **AND** the request includes a valid Bearer token in the Authorization header
- **THEN** the endpoint SHALL respond with the list of available tools
- **AND** the response SHALL include the `open_file` tool definition

#### Scenario: Invalid or missing token
- **WHEN** a request arrives at `POST /api/mimo-mcp` without an Authorization header
- **OR** the Bearer token is not found in the token map
- **THEN** the endpoint SHALL respond with HTTP 401
- **AND** it SHALL not execute any tool or broadcast any message

#### Scenario: Token resolves to session
- **WHEN** a valid Bearer token is presented
- **THEN** the endpoint SHALL resolve it to the corresponding `sessionId`
- **AND** all tool calls SHALL be scoped to that session

---

### Requirement: open_file Tool
The MCP endpoint SHALL provide an `open_file` tool that opens a file in the session's EditBuffer.

#### Scenario: Open a valid file
- **WHEN** an ACP calls `open_file` with a path that exists within the session workspace
- **THEN** the platform SHALL broadcast `{ type: "open_file_in_editbuffer", sessionId, path }` to all WebSocket clients for that session
- **AND** the tool SHALL return `{ success: true, path }`

#### Scenario: Path outside workspace
- **WHEN** an ACP calls `open_file` with a path that traverses outside the session workspace (e.g., `../../etc/passwd`)
- **THEN** the tool SHALL return an error result: `{ success: false, error: "Access denied: path outside workspace" }`
- **AND** no broadcast SHALL be sent

#### Scenario: File does not exist
- **WHEN** an ACP calls `open_file` with a path that does not exist in the session workspace
- **THEN** the tool SHALL return an error result: `{ success: false, error: "File not found" }`
- **AND** no broadcast SHALL be sent

---

### Requirement: MCP Config Injection in session_ready
The platform SHALL automatically include the platform MCP server config in the `session_ready` message so ACPs gain access without manual configuration.

#### Scenario: session_ready includes MCP config
- **WHEN** the platform sends a `session_ready` message to mimo-agent
- **THEN** the `mcpServers` array SHALL include a config entry for the platform MCP server
- **AND** the entry SHALL have `type: "http"`, the platform URL, and the session's `mcpToken` as a Bearer header

#### Scenario: Config is stable across agent restarts
- **WHEN** mimo-agent reconnects and receives `session_ready` again
- **THEN** the platform MCP config in the message SHALL use the same `mcpToken` as before
- **AND** the ACP SHALL be able to reconnect to the MCP endpoint without any additional coordination
