## Context

MCP servers routes handle management of MCP server configurations with support for different transports (stdio, HTTP). Routes support both HTML and JSON responses.

## Goals / Non-Goals

**Goals:**
- Create internal API for MCP servers CRUD
- Refactor routes to proxy to internal API
- Maintain support for content negotiation

**Non-Goals:**
- Changing McpServerService implementation
- New MCP server types

## Decisions

### 1. Endpoint Mapping
- `GET /api/internal/mcp-servers` → list all MCP servers
- `GET /api/internal/mcp-servers/:id` → get MCP server by ID
- `POST /api/internal/mcp-servers` → create MCP server
- `PUT /api/internal/mcp-servers/:id` → update MCP server
- `DELETE /api/internal/mcp-servers/:id` → delete MCP server

### 2. Content Negotiation
Routes layer handles Accept header detection and decides between HTML or JSON proxy to internal API.

### 3. MCP Server Types
Supports stdio (command + args) and HTTP (url + headers) transports.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Content negotiation complexity | Routes detect Accept header, internal API always returns JSON |

## Migration Plan

1. Create internal API handlers
2. Create internal API routes
3. Refactor web routes with content negotiation
4. Update tests
5. Verify MCP server CRUD works
