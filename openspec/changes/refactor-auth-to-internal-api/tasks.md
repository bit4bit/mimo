## 1. Internal API

- [x] 1.1 Create `src/api/internal/auth/types.ts` with request/response types
- [x] 1.2 Create `src/api/internal/auth/handlers.ts` with login/logout/register handlers
- [x] 1.3 Create `src/api/internal/auth/routes.ts` with router setup

## 2. Route Refactoring

- [x] 2.1 Refactor GET `/auth/register` route (form rendering stays)
- [x] 2.2 Refactor POST `/auth/register` route to proxy to internal API
- [x] 2.3 Refactor GET `/auth/login` route (form rendering stays)
- [x] 2.4 Refactor POST `/auth/login` route to proxy to internal API and set cookies
- [x] 2.5 Refactor GET `/auth/logout` route to clear cookies

## 3. Testing

- [x] 3.1 Write tests for auth internal API endpoints
- [x] 3.2 Update auth route tests to mock internal API calls
- [x] 3.3 Verify registration flow works
- [x] 3.4 Verify login flow works with cookies
- [x] 3.5 Verify logout clears cookies
