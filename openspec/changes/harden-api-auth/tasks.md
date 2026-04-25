## 1. Cleanup Dead Code

- [x] 1.1 Remove both `/api/test` route registrations from `packages/mimo-platform/src/index.tsx` (lines ~292 and ~309)
- [x] 1.2 Remove the `protectedRoutes` import from `packages/mimo-platform/src/index.tsx`
- [x] 1.3 Remove the `app.route("/", protectedRoutes)` mount from `packages/mimo-platform/src/index.tsx`
- [x] 1.4 Delete `packages/mimo-platform/src/protected/routes.tsx`

## 2. Global Auth Middleware

- [x] 2.1 Import `authMiddleware` (or `createAuthMiddleware`) at the top of `packages/mimo-platform/src/index.tsx`
- [x] 2.2 Add a `PUBLIC_PATHS` allowlist constant covering: `/`, `/health`, `/api/projects/public`, `/api/help`, and prefix matches for `/auth/`, `/js/`, `/vendor/`, `/api/mimo-mcp`
- [x] 2.3 Register `app.use("*", ...)` before all route registrations that skips the allowlist and delegates to `authMiddleware` for all other paths

## 3. WebSocket Chat Authentication

- [x] 3.1 In the `/ws/chat` upgrade branch of `mimoServer.setup().fetch`, add JWT cookie extraction from the `Cookie` header (same pattern as `/ws/files` at lines ~457-474)
- [x] 3.2 Call `mimoContext.services.auth.verifyToken(token)` and reject with HTTP 401 if the token is missing or invalid
- [x] 3.3 Load the session via `sessionRepository.findById(sessionId)` and reject with HTTP 401 if the session does not exist or `session.owner !== payload.username`

## 4. Tests

- [x] 4.1 Write a test asserting that `GET /api/test` returns 302 redirect (endpoint removed, now protected)
- [x] 4.2 Write a test asserting that an unauthenticated request to a protected route (e.g., `/sessions/anything`) returns 302 to `/auth/login`
- [x] 4.3 Write a test asserting that `GET /health` returns 200 without authentication
- [x] 4.4 Write a test asserting that `GET /auth/login` returns 200 without authentication

## 5. Verification

- [x] 5.1 Run `cd packages/mimo-platform && bun test` — 747/756 tests pass (9 pre-existing failures unrelated to auth)
- [ ] 5.2 Manually confirm `GET /health` returns 200 unauthenticated
- [ ] 5.3 Manually confirm `GET /auth/login` renders the login page unauthenticated
- [ ] 5.4 Manually confirm `GET /dashboard` without a token cookie redirects to `/auth/login`
