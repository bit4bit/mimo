## Why

The MCP servers domain manages MCP (Model Context Protocol) server configurations. Creating an internal API enables MCP server management to be reused across different interfaces.

## What Changes

- **New**: Internal API endpoints for MCP servers CRUD at `/api/internal/mcp-servers/*`
- **Refactor**: `mcp-servers/routes.tsx` becomes thin proxy layer
  - Proxies MCP server operations to internal API
  - Keeps JSX rendering for list and form pages
- **No breaking changes**: All existing routes continue to work identically

## Capabilities

### New Capabilities
- `internal-api-mcp-servers`: Internal REST API for MCP server management (list, get, create, update, delete MCP servers)

### Modified Capabilities
<!-- None - this is implementation refactoring -->

## Impact

- **Routes affected**: `/mcp-servers`, `/mcp-servers/new`, `/mcp-servers/:id/edit`
- **Dependencies**: Requires `setup-internal-api-infrastructure` to be complete
- **Services unchanged**: Uses McpServerService, McpServerRepository
- **Content negotiation**: Current routes support both HTML and JSON - internal API is JSON-only
