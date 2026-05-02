## 1. Create Session Route (POST /sessions)

- [x] 1.1 Replace `mcpServerService.findAll()` with HTTP GET to `/api/internal/mcp-servers`
- [x] 1.2 Replace `sessionRepository.create()` with HTTP POST to `/api/internal/sessions`
- [x] 1.3 Handle validation errors from internal API
- [x] 1.4 Test session creation via HTTP proxy

## 2. Delete Session Operations

- [x] 2.1 Replace `sessionRepository.findById()` before delete with HTTP GET
- [x] 2.2 Replace `sessionRepository.delete()` with HTTP DELETE
- [x] 2.3 Handle 404 errors from internal API
- [x] 2.4 Test session deletion via HTTP proxy
- [x] 2.5 Find and replace all 8+ delete operations in the file

## 3. Update Session Operations

- [x] 3.1 Replace `sessionRepository.update()` with HTTP PUT
- [x] 3.2 Handle update validation errors
- [x] 3.3 Test session updates via HTTP proxy
- [x] 3.4 Find and replace all 2+ update operations in the file

## 4. List Sessions Operations

- [x] 4.1 Replace `sessionRepository.listAll()` with HTTP GET
- [x] 4.2 Test session listing via HTTP proxy

## 5. Get Session Operations

- [x] 5.1 Replace remaining `sessionRepository.findById()` calls with HTTP GET
- [x] 5.2 Verify session retrieval works via HTTP proxy
- [x] 5.3 Find and replace all remaining findById calls

## 6. MCP Servers Operations

- [x] 6.1 Replace `mcpServerService.findById()` with HTTP GET
- [x] 6.2 Replace `mcpServerService.findDuplicateNames()` with HTTP POST `/api/internal/mcp-servers/validate-duplicates`
- [x] 6.3 Replace `mcpServerService.resolveMcpServers()` with HTTP POST `/api/internal/mcp-servers/resolve`
- [x] 6.4 Test MCP server operations via HTTP proxy

## 7. Agent Operations

- [x] 7.1 Replace `agentRepository.findById()` with HTTP GET to `/api/internal/agents/:id`
- [x] 7.2 Test agent lookup via HTTP proxy

## 8. Configuration Operations

- [x] 8.1 Replace `configService.load()` with HTTP GET to `/api/internal/config`
- [x] 8.2 Test config loading via HTTP proxy

## 9. Chat Operations (Complete Partial Implementation)

- [x] 9.1 Complete GET `/sessions/:id/chat` to use HTTP proxy consistently
- [x] 9.2 Replace `chatService.saveMessage()` with HTTP POST to `/api/internal/chat/messages`
- [x] 9.3 Keep WebSocket handling in routes (not HTTP)
- [x] 9.4 Test chat operations via HTTP proxy

## 10. Verification and Cleanup

- [x] 10.1 Verify `sessionRepository` calls = 0 (persisted data)
- [x] 10.2 Verify `chatService` calls (persisted) = 0
- [x] 10.3 Verify `mcpServerService` calls (persisted) = 0
- [x] 10.4 Verify `agentRepository` calls (persisted) = 0
- [x] 10.5 Keep runtime/infrastructure calls (authService, fileService, searchService, expertService, agentService)
- [x] 10.6 Update Sessions route tests
- [x] 10.7 Run full test suite
- [x] 10.8 Manual testing: Create, view, update, delete sessions, chat, assign agent

## 11. Documentation

- [x] 11.1 Document the completed proxy pattern
- [x] 11.2 Update any architecture docs

## 12. New Internal API Endpoints Added

- [x] 12.1 `POST /api/internal/mcp-servers/validate-duplicates` - Check for duplicate MCP server names
- [x] 12.2 `POST /api/internal/mcp-servers/resolve` - Resolve MCP servers by IDs
- [x] 12.3 `POST /api/internal/chat/messages` - Save chat message