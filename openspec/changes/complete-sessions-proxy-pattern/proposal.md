## Why

The Sessions routes have been **partially refactored** to use the HTTP proxy pattern:

- **Completed**: GET `/sessions/:id` (view session detail) now uses HTTP fetch to internal API
- **Remaining**: 57+ direct service/repository calls across other routes still need refactoring

Direct calls found:
- `sessionRepository.create()` - POST `/sessions` (create session)
- `sessionRepository.delete()` - Multiple locations (delete session)
- `sessionRepository.update()` - Update operations
- `sessionRepository.listAll()` - List sessions
- `mcpServerService.findAll()` - Get MCP servers
- `agentRepository.findById()` - Get assigned agent
- `configService.load()` - Load configuration
- `sharedFossilServer.getUrl()` - Get fossil URL
- Plus many more...

To complete the decoupling between web layer and business logic, all remaining routes must use the internal API.

## What Changes

### Refactor All Remaining Sessions Routes to HTTP Proxy

Routes needing refactoring:

1. **POST `/sessions`** - Create new session
   - Replace `sessionRepository.create()` with HTTP POST
   - Replace `mcpServerService.findAll()` with HTTP GET

2. **DELETE `/sessions/:id`** - Delete session
   - Replace `sessionRepository.delete()` with HTTP DELETE
   - Replace `sessionRepository.findById()` with HTTP GET

3. **POST `/sessions/:id/*`** - Update session operations
   - Replace `sessionRepository.update()` with HTTP PUT

4. **GET `/sessions/:id/chat`** - Chat history (partial - needs completion)
   - Complete the HTTP proxy implementation

5. **POST `/sessions/:id/chat`** - Save chat message
   - Replace `chatService.saveMessage()` with HTTP POST

6. **Session detail route completion**
   - Replace remaining `agentRepository.findById()` with HTTP GET
   - Replace `configService.load()` with HTTP GET
   - Keep `sharedFossilServer.getUrl()` (infrastructure call, not business logic)
   - Keep `sessionStateService.getModelState()` (runtime state, not persisted data)

## Capabilities

### New Capabilities
- `sessions-proxy-pattern-completion`: Complete HTTP proxy pattern for all remaining Sessions routes

### Modified Capabilities
<!-- None - completes existing implementation -->

## Impact

- **Only file affected**: `src/sessions/routes.tsx`
- **Routes affected**: All remaining session routes except GET `/sessions/:id` (already done)
- **No breaking changes**: Internal API endpoints already exist
- **Test impact**: Update tests to mock HTTP calls
- **End goal**: All domains use consistent HTTP proxy pattern
