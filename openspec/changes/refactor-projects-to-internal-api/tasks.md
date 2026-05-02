## 1. Internal API

- [x] 1.1 Create `src/api/internal/projects/types.ts` with request/response types
- [x] 1.2 Create `src/api/internal/projects/handlers.ts` with CRUD handlers
- [x] 1.3 Create `src/api/internal/projects/routes.ts` with router setup

## 2. Route Refactoring

- [x] 2.1 Refactor GET `/projects` route to proxy to internal API
- [x] 2.2 Refactor GET `/projects/new` route (form rendering stays, data from API)
- [x] 2.3 Refactor POST `/projects` route to proxy to internal API
- [x] 2.4 Refactor GET `/projects/:id` route to proxy to internal API
- [x] 2.5 Refactor GET `/projects/:id/edit` route to proxy to internal API
- [x] 2.6 Refactor PUT `/projects/:id` route to proxy to internal API
- [x] 2.7 Refactor DELETE `/projects/:id` route to proxy to internal API
- [x] 2.8 Refactor GET `/projects/:id/sessions` route to proxy to internal API

## 3. Testing

- [x] 3.1 Write tests for projects internal API endpoints
- [x] 3.2 Update projects route tests to mock internal API calls
- [x] 3.3 Verify all projects routes still work correctly
