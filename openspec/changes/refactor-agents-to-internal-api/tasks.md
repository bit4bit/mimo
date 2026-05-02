## 1. Internal API

- [x] 1.1 Create `src/api/internal/agents/types.ts` with request/response types
- [x] 1.2 Create `src/api/internal/agents/handlers.ts` with CRUD + capabilities handlers
- [x] 1.3 Create `src/api/internal/agents/routes.ts` with router setup

## 2. Route Refactoring

- [x] 2.1 Refactor GET `/agents` route to proxy to internal API
- [x] 2.2 Refactor GET `/agents/new` route (form rendering)
- [x] 2.3 Refactor POST `/agents` route to proxy to internal API
- [x] 2.4 Refactor GET `/agents/:id` route to proxy to internal API
- [x] 2.5 Refactor PUT `/agents/:id` route to proxy to internal API
- [x] 2.6 Refactor DELETE `/agents/:id` route to proxy to internal API
- [x] 2.7 Refactor GET `/agents/:id/capabilities` route to proxy to internal API
- [x] 2.8 Refactor POST `/agents/:id/capabilities/refresh` route to proxy to internal API
- [x] 2.9 Keep agent token endpoints separate (`/api/internal/agents/me/*`)

## 3. Testing

- [x] 3.1 Write tests for agents internal API endpoints
- [x] 3.2 Update agents route tests to mock internal API calls
- [x] 3.3 Verify agent authentication still works
- [x] 3.4 Verify capabilities refresh still works
