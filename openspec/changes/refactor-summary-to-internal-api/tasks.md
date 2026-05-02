## 1. Internal API

- [x] 1.1 Create `src/api/internal/summary/types.ts` with request/response types
- [x] 1.2 Create `src/api/internal/summary/handlers.ts` with refresh/latest handlers
- [x] 1.3 Create `src/api/internal/summary/routes.ts` with router setup

## 2. Route Refactoring

- [x] 2.1 Refactor POST `/summary/refresh` route to proxy to internal API
- [x] 2.2 Refactor GET `/summary/latest` route to proxy to internal API

## 3. Testing

- [x] 3.1 Write tests for summary internal API endpoints
- [x] 3.2 Update summary route tests to mock internal API calls
- [x] 3.3 Verify summary generation triggers correctly
- [x] 3.4 Verify latest summary retrieval works
