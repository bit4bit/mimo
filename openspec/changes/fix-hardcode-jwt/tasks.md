## 1. Remove hardcoded secret and singletons from jwt.ts

- [x] 1.1 Delete `DEFAULT_JWT_SECRET` constant from `packages/mimo-platform/src/auth/jwt.ts`
- [x] 1.2 Remove default parameter value from `JwtService` constructor (secret is now required)
- [x] 1.3 Delete the `jwtService` module-level singleton export
- [x] 1.4 Delete the `generateToken` and `verifyToken` free function exports

## 2. Remove authMiddleware singleton from middleware.ts

- [x] 2.1 Delete `export const authMiddleware` singleton from `packages/mimo-platform/src/auth/middleware.ts`
- [x] 2.2 Remove the `jwtService` import from `middleware.ts` (no longer needed)

## 3. Fail fast on missing JWT_SECRET

- [x] 3.1 In `createMimoContext` (`packages/mimo-platform/src/context/mimo-context.ts`), throw an error if `JWT_SECRET` is absent or empty instead of using the hardcoded fallback
- [x] 3.2 In `packages/mimo-platform/src/index.tsx`, validate `process.env.JWT_SECRET` before calling `createMimoContext` and exit with a clear error message if missing

## 4. Wire global route guard to injected JwtService

- [x] 4.1 In `index.tsx`, replace `import { authMiddleware }` with `import { createAuthMiddleware }`
- [x] 4.2 Replace `authMiddleware(c, next)` call with `createAuthMiddleware(mimoContext.services.auth)(c, next)` (or instantiate once after context is created)

## 5. Wire route-level middleware to injected JwtService

- [x] 5.1 In `packages/mimo-platform/src/sync/routes.ts`, replace `import { authMiddleware }` with `import { createAuthMiddleware }` and call `createAuthMiddleware(mimoContext.services.auth)` inside `createSyncRoutes`
- [x] 5.2 In `packages/mimo-platform/src/auto-commit/routes.ts`, apply the same pattern inside `createAutoCommitRouter`
- [x] 5.3 In `packages/mimo-platform/src/commits/routes.ts`, apply the same pattern inside `createCommitRoutes`

## 6. Update tests

- [x] 6.1 In `packages/mimo-platform/test/auto-commit-routes.test.ts`, replace `import { generateToken }` with a local `JwtService` instance using a fixed test secret, and use it to mint tokens
- [x] 6.2 In `packages/mimo-platform/test/auth.test.ts`, replace any use of the `authMiddleware` singleton with `createAuthMiddleware(new JwtService("test-secret"))`
- [x] 6.3 In `packages/mimo-platform/test/projects.test.ts`, replace `authMiddleware` singleton import with `createAuthMiddleware(ctx.services.auth)` from the test's `MimoContext`
- [x] 6.4 In `packages/mimo-platform/test/api-auth-boundary.test.ts`, replace `authMiddleware` singleton with `createAuthMiddleware(ctx.services.auth)`

## 7. Verify

- [x] 7.1 Run `cd packages/mimo-platform && bun test` — all tests pass
- [x] 7.2 Confirm no remaining imports of `authMiddleware` or `jwtService` singletons outside of test setup
- [x] 7.3 Confirm no remaining references to `DEFAULT_JWT_SECRET` or the hardcoded string `"your-secret-key-change-in-production"`
