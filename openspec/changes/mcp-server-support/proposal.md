## Why

MCP (Model Context Protocol) servers extend AI agent capabilities by providing tools, resources, and prompts for external systems like filesystems, databases, and APIs. Users need a way to configure MCP servers once and attach them to sessions so agents can leverage these capabilities during development workflows.

## What Changes

- Add MCP server management to platform - users can create, edit, and delete MCP server configurations
- Store MCP servers at user level in `~/.mimo/mcp-servers/`
- Extend session creation to allow selecting which MCP servers to attach
- Modify agent to receive MCP server configs and pass them to ACP `newSession()` call
- Update session bootstrap message to include full MCP server configurations
- Create UI pages: MCP servers list, MCP server form, and MCP server selector in session creation

## Capabilities

### New Capabilities

- `mcp-servers`: User-level MCP server configuration management (CRUD operations, storage in ~/.mimo/mcp-servers/)

### Modified Capabilities

- `session-management`: Sessions can have MCP servers attached via `mcpServerIds` array in session.yaml
- `session-bootstrap`: Session bootstrap message includes full MCP server configurations for agent to consume
- `agent-lifecycle`: Agent spawns ACP processes with `mcpServers` parameter populated from session configuration

## Impact

- **New directories**: `~/.mimo/mcp-servers/` for storing server configurations
- **New platform routes**: `/mcp-servers` (list, create, edit, delete endpoints)
- **New UI components**: McpServerListPage, McpServerForm, MCP server selector in SessionCreatePage
- **Modified session repository**: Adds `mcpServerIds` field to Session interface
- **Modified agent**: SessionInfo gains `mcpServers` field; spawnAcpProcess passes configs to AcpClient
- **Modified ACP client**: `newSession()` call populated with actual MCP server configs instead of empty array
- **Dependencies**: No new external dependencies; uses existing ACP SDK support for mcpServers
