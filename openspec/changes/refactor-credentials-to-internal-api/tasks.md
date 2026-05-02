## 1. Internal API

- [x] 1.1 Create `src/api/internal/credentials/types.ts` with request/response types
- [x] 1.2 Create `src/api/internal/credentials/handlers.ts` with CRUD handlers
- [x] 1.3 Create `src/api/internal/credentials/routes.ts` with router setup

## 2. Route Refactoring

- [x] 2.1 Refactor GET `/credentials` route to proxy to internal API
- [x] 2.2 Refactor GET `/credentials/new` route (form rendering)
- [x] 2.3 Refactor POST `/credentials` route to proxy to internal API
- [x] 2.4 Refactor GET `/credentials/:id/edit` route to proxy to internal API
- [x] 2.5 Refactor POST `/credentials/:id/edit` route to proxy to internal API
- [x] 2.6 Refactor POST `/credentials/:id/delete` route to proxy to internal API

## 3. Testing

- [x] 3.1 Write tests for credentials internal API endpoints (HTTPS)
- [x] 3.2 Write tests for credentials internal API endpoints (SSH)
- [x] 3.3 Update credentials route tests to mock internal API calls
- [x] 3.4 Verify credentials CRUD works for both HTTPS and SSH
- [x] 3.5 Verify secrets are not exposed in list endpoint
