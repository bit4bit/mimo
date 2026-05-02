## 1. Internal API

- [x] 1.1 Create `src/api/internal/mcp-servers/types.ts` with request/response types
- [x] 1.2 Create `src/api/internal/mcp-servers/handlers.ts` with CRUD handlers
- [x] 1.3 Create `src/api/internal/mcp-servers/routes.ts` with router setup
- [x] 1.4 Update `src/api/internal/index.ts` to mount MCP servers routes

## 2. Route Refactoring

- [x] 2.1 Refactor GET `/mcp-servers` route to proxy to internal API
- [x] 2.2 Refactor GET `/mcp-servers/new` route (form rendering)
- [x] 2.3 Refactor POST `/mcp-servers` route to proxy to internal API
- [x] 2.4 Refactor GET `/mcp-servers/:id/edit` route to proxy to internal API
- [x] 2.5 Refactor POST `/mcp-servers/:id` route to proxy to internal API
- [x] 2.6 Refactor DELETE `/mcp-servers/:id` route to proxy to internal API

## 3. Testing

- [x] 3.1 Write tests for mcp-servers internal API endpoints
- [x] 3.2 Update mcp-servers route tests to mock internal API calls
- [x] 3.3 Verify MCP server CRUD works for stdio transport
- [x] 3.4 Verify MCP server CRUD works for HTTP transport
