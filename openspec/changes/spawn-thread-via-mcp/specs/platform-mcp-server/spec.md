## MODIFIED Requirements

### Requirement: Platform MCP HTTP Endpoint

The platform SHALL expose an MCP-protocol HTTP endpoint at `POST /api/mimo-mcp` that ACPs can call to interact with platform capabilities.

#### Scenario: Tool list discovery

- **WHEN** an ACP client sends an MCP initialize or tools/list request to `POST /api/mimo-mcp`
- **AND** the request includes a valid Bearer token in the Authorization header
- **THEN** the endpoint SHALL respond with the list of available tools
- **AND** the response SHALL include the `open_file` tool definition
- **AND** the response SHALL include the `create_chat_thread` and `list_thread_options` tool definitions

#### Scenario: Invalid or missing token

- **WHEN** a request arrives at `POST /api/mimo-mcp` without an Authorization header
- **OR** the Bearer token is not found in the token map
- **THEN** the endpoint SHALL respond with HTTP 401
- **AND** it SHALL not execute any tool or broadcast any message

#### Scenario: Token resolves to session

- **WHEN** a valid Bearer token is presented
- **THEN** the endpoint SHALL resolve it to the corresponding `sessionId`
- **AND** all tool calls SHALL be scoped to that session

### Requirement: MCP Config Injection in session_ready

The platform SHALL automatically include the platform MCP server config in the `session_ready` message so ACPs gain access without manual configuration. The mimo MCP config attached to each per-thread ACP runtime SHALL identify the calling thread via an `X-Mimo-Thread-Id` header.

#### Scenario: session_ready includes MCP config

- **WHEN** the platform sends a `session_ready` message to mimo-agent
- **THEN** the `mcpServers` array SHALL include a config entry for the platform MCP server
- **AND** the entry SHALL have `type: "http"`, the platform URL, and the session's `mcpToken` as a Bearer header

#### Scenario: Config is stable across agent restarts

- **WHEN** mimo-agent reconnects and receives `session_ready` again
- **THEN** the platform MCP config in the message SHALL use the same `mcpToken` as before
- **AND** the ACP SHALL be able to reconnect to the MCP endpoint without any additional coordination

#### Scenario: Per-thread caller identification

- **WHEN** mimo-agent spawns the ACP runtime for a chat thread
- **THEN** the mimo MCP config handed to that runtime SHALL include an `X-Mimo-Thread-Id` header whose value is that thread's `chatThreadId`
- **AND** the endpoint SHALL use that header to identify the calling thread for tools that require it
