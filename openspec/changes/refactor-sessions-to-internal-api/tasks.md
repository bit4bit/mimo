## 1. Internal API

- [x] 1.1 Create `src/api/internal/sessions/types.ts` with request/response types
- [x] 1.2 Create `src/api/internal/sessions/handlers.ts` with CRUD + operations handlers
- [x] 1.3 Create `src/api/internal/sessions/routes.ts` with router setup

## 2. Route Refactoring

- [x] 2.1 Refactor GET `/sessions` route to proxy to internal API
- [x] 2.2 Refactor GET `/sessions/new` route (form rendering, data from API)
- [x] 2.3 Refactor POST `/sessions` route to proxy to internal API
- [x] 2.4 Refactor GET `/sessions/:id` route to proxy to internal API
- [x] 2.5 Refactor GET `/sessions/:id/chat` route to proxy to internal API
- [x] 2.6 Keep WebSocket handling in routes layer (not in internal API)
- [x] 2.7 Refactor PUT `/sessions/:id` route to proxy to internal API
- [x] 2.8 Refactor DELETE `/sessions/:id` route to proxy to internal API
- [x] 2.9 Refactor agent assignment endpoint to proxy to internal API

## 3. Testing

- [x] 3.1 Write tests for sessions internal API endpoints
- [x] 3.2 Update sessions route tests to mock internal API calls
- [x] 3.3 Verify chat functionality still works
- [x] 3.4 Verify session CRUD still works
