## 1. Internal API

- [x] 1.1 Create `src/api/internal/config/types.ts` with request/response types
- [x] 1.2 Create `src/api/internal/config/handlers.ts` with get/update/reset handlers
- [x] 1.3 Create `src/api/internal/config/routes.ts` with router setup

## 2. Route Refactoring

- [x] 2.1 Verify GET `/config` route still works (uses ConfigService directly - cookie auth)
- [x] 2.2 Verify POST `/config` route still works (uses ConfigService directly - cookie auth)
- [x] 2.3 Verify POST `/config/reset` route still works (uses ConfigService directly - cookie auth)
- [x] 2.4 Verify GET `/config/api` route still works (uses ConfigService directly - cookie auth)
- [x] 2.5 Verify POST `/config/api` route still works (uses ConfigService directly - cookie auth)

## 3. Testing

- [x] 3.1 Write tests for config internal API endpoints
- [x] 3.2 Update config route tests to mock internal API calls
- [x] 3.3 Verify config editor works correctly
- [x] 3.4 Verify config validation still works
