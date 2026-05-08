## Why

The sessions domain has complex HTML routes with forms, chat interfaces, and session management. Extracting an internal API enables the session management logic to be reused by other frontends and makes the web layer testable via HTTP mocking.

## What Changes

- **New**: Internal API endpoints for sessions CRUD at `/api/internal/sessions/*`
- **New**: Internal API endpoints for chat history and thread management
- **New**: Internal API endpoint for agent assignment to sessions
- **Refactor**: `sessions/routes.tsx` becomes thin proxy layer
  - Keeps JSX rendering for SessionDetailPage, SessionCreatePage
  - Proxies data operations to internal API
- **No breaking changes**: All existing routes continue to work identically

## Capabilities

### New Capabilities

- `internal-api-sessions`: Internal REST API for session management (CRUD, chat history, agent assignment)

### Modified Capabilities

<!-- None - this is implementation refactoring -->

## Impact

- **Routes affected**: `/sessions`, `/sessions/new`, `/sessions/:id`, `/sessions/:id/chat`
- **Dependencies**: Requires `setup-internal-api-infrastructure` to be complete
- **Services unchanged**: Uses ChatService, FrameStateService, SessionRepository
- **WebSocket handling**: Stays in routes layer (internal API is REST only)
