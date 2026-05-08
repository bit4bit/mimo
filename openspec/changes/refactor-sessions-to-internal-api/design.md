## Context

Sessions routes are complex with chat, state management, and agent assignment. This refactor extracts the business logic.

## Goals / Non-Goals

**Goals:**

- Create internal API for session CRUD and operations
- Refactor routes to proxy to internal API
- Maintain chat and WebSocket functionality

**Non-Goals:**

- Changing ChatService or session state management
- WebSocket changes

## Decisions

### 1. Endpoint Mapping

- `GET /api/internal/sessions` → list sessions
- `GET /api/internal/sessions/:id` → get session with full state
- `POST /api/internal/sessions` → create session
- `PUT /api/internal/sessions/:id` → update session
- `DELETE /api/internal/sessions/:id` → delete session
- `GET /api/internal/sessions/:id/chat` → get chat history
- `POST /api/internal/sessions/:id/assign-agent` → assign agent

### 2. WebSocket Handling

WebSocket connections stay in routes layer. Internal API only handles REST endpoints.

## Risks / Trade-offs

| Risk                  | Mitigation                                          |
| --------------------- | --------------------------------------------------- |
| Chat streaming        | Not affected, WebSocket stays in routes             |
| Complex session state | Internal API returns full state, routes just render |

## Migration Plan

1. Create internal API handlers
2. Create internal API routes
3. Refactor web routes (keep WebSocket logic)
4. Update tests
5. Test chat functionality
