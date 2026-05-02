## Context

The platform uses `jose` for JWT signing/verification. `JwtService` is a class that accepts a secret at construction time — the right abstraction already exists. The problem is that `jwt.ts` also exports a module-level singleton (`jwtService`) and convenience functions (`generateToken`, `verifyToken`) that bypass dependency injection and always use the hardcoded default. `middleware.ts` builds a second singleton (`authMiddleware`) on top of this.

`index.tsx` imports the `authMiddleware` singleton for the global route guard, while `createAuthRoutes` correctly uses `mimoContext.services.auth` (which is a `JwtService` constructed with the env-configured secret). The two instances never share the same secret, so authentication is broken whenever `JWT_SECRET` is actually configured.

The fix is a wiring change: remove the singletons and thread the properly-constructed `JwtService` through to everywhere it is needed. The routes that still import `authMiddleware` directly (`sync`, `auto-commit`, `commits`) need to receive the auth service via their existing `MimoContext` argument.

## Goals / Non-Goals

**Goals:**
- Single `JwtService` instance constructed once with the env secret, shared across all auth paths
- Startup fails loudly when `JWT_SECRET` is missing rather than silently using a guessable default
- No module-level singletons with hardcoded secrets

**Non-Goals:**
- Changing the JWT algorithm, expiry, or token shape
- Adding token rotation or refresh flows
- Modifying the agent token path (`verifyAgentToken`)

## Decisions

**Remove singletons entirely rather than reading env at module load time.**
Alternative: change `DEFAULT_JWT_SECRET` to `process.env.JWT_SECRET` at module level. Rejected — module-level env reads happen before the application bootstrap, make testing harder (env must be set before import), and obscure the dependency. Explicit constructor injection is already the project pattern.

**Fail fast in `createMimoContext` (not just in `index.tsx`).**
`createMimoContext` is the canonical place where `MimoEnv` is assembled. Validating there ensures any caller (including tests that construct a context) gets the same guard. `index.tsx` also validates before calling `createMimoContext` so the error surface is clear at the entry point.

**Route files receive auth service via their `MimoContext` parameter, not as a new argument.**
`sync/routes.ts`, `auto-commit/routes.ts`, and `commits/routes.ts` already accept a `MimoContext`-shaped object. `services.auth` is already part of that interface. No new parameter threading is needed — routes just call `createAuthMiddleware(ctx.services.auth)` locally instead of importing the singleton.

**Delete the `generateToken`/`verifyToken` free functions.**
The only callers are tests in `auto-commit-routes.test.ts` that import `generateToken` to mint tokens for test requests. Those tests should construct a `JwtService` with a known secret and call `generateToken` on it, which is the same pattern used in all other test files already.

## Risks / Trade-offs

**Existing deployments without `JWT_SECRET` set will fail to start after this change.**
→ This is intentional and documented as a breaking change. The alternative (silent insecure fallback) is worse. Operators need to set `JWT_SECRET` in their environment.

**Tests that rely on the singleton's hardcoded secret implicitly pass today.**
→ Tests must be updated to use explicit `JwtService` instances. All test files already follow this pattern except `auto-commit-routes.test.ts` and the `authMiddleware`-importing tests; the update is mechanical.

## Migration Plan

1. Set `JWT_SECRET` in any deployment environment before deploying this version.
2. Deploy — server starts and validates the secret at boot.
3. Rollback: revert to the previous binary; the env var is harmless if present.

## Open Questions

- None. The approach is straightforward given the existing injection infrastructure.
