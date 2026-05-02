## Why

When `JWT_SECRET` is set in the environment, login mints tokens signed with that secret while the global HTTP route guard verifies tokens using a hardcoded default (`"your-secret-key-change-in-production"`), causing every authenticated request to be rejected. When `JWT_SECRET` is not set, both sides silently fall back to the public known default, making the platform insecure.

## What Changes

- Remove `DEFAULT_JWT_SECRET` constant from `auth/jwt.ts`
- Remove `jwtService` module-level singleton and the `generateToken`/`verifyToken` free functions that wrap it from `auth/jwt.ts`
- Remove `authMiddleware` exported singleton from `auth/middleware.ts`
- In `index.tsx`, replace import of `authMiddleware` singleton with `createAuthMiddleware(mimoContext.services.auth)`
- In `sync/routes.ts`, `auto-commit/routes.ts`, and `commits/routes.ts`, replace `authMiddleware` singleton with `createAuthMiddleware` called with the auth service passed via context
- In `createMimoContext`, fail fast with a thrown error if `JWT_SECRET` is absent rather than silently falling back to the hardcoded default
- In `index.tsx`, fail fast if `JWT_SECRET` env var is not set

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `user-auth`: JWT secret is now required at startup (no silent fallback); the HTTP route guard uses the same injected `JwtService` instance as the login flow.

## Impact

- `packages/mimo-platform/src/auth/jwt.ts` — removes singleton and free functions
- `packages/mimo-platform/src/auth/middleware.ts` — removes `authMiddleware` singleton
- `packages/mimo-platform/src/index.tsx` — wires guard to `mimoContext.services.auth`
- `packages/mimo-platform/src/sync/routes.ts` — receives auth service, removes direct import of singleton
- `packages/mimo-platform/src/auto-commit/routes.ts` — same
- `packages/mimo-platform/src/commits/routes.ts` — same
- `packages/mimo-platform/src/context/mimo-context.ts` — fail-fast on missing `JWT_SECRET`
- Tests in `auth.test.ts`, `projects.test.ts`, `api-auth-boundary.test.ts`, `auto-commit-routes.test.ts` — must be updated to pass explicit auth service instead of relying on singleton
- **BREAKING**: `JWT_SECRET` env var is now required; startup fails without it
