## Context

mimo-platform uses Hono as its HTTP framework. Authentication is JWT-based: a `token` cookie (HttpOnly, verified by `JwtService.verifyToken`) is the authoritative credential. A second `username` cookie (not HttpOnly) is set for convenience but must never be the sole auth gate.

Two auth patterns exist today:

- **Pattern A** (`authMiddleware`): Used by dashboard, projects, agents, sync, commits, config, credentials, auto-commit. Reads the `token` cookie, verifies JWT, sets `c.get("user")`. Correct.
- **Pattern B** (`getAuthUsername` helper): Used by sessions, summary, mcp-servers. Checks `username` cookie first (no JWT), falls back to JWT. Weaker — `summary/routes.tsx` has no JWT fallback at all.

The WebSocket upgrade path is handled in a custom `fetch` function outside Hono, so Hono middleware does not apply there.

## Goals / Non-Goals

**Goals:**
- Every HTTP route is protected by default; no new route can be added without explicitly opting into the public allowlist.
- `/ws/chat` WebSocket requires a valid JWT and session ownership before upgrade.
- Remove dead/debug code (`/api/test` ×2, empty `protectedRoutes`).
- No changes to Pattern A routes — they continue to work correctly.
- Pattern B routes gain JWT enforcement without modifying their files.

**Non-Goals:**
- Migrating Pattern B helpers to use `authMiddleware` directly (the global middleware makes this unnecessary for correctness; it can be done as a separate cleanup).
- Changing the public allowlist contents beyond what is explored (e.g., making `/api/help` private).
- Any change to the MCP Bearer token auth path (`/api/mimo-mcp`).

## Decisions

### Decision 1: Global `app.use("*", ...)` with path allowlist — chosen over per-route migration

**Rationale:** Migrating every Pattern B route to use `authMiddleware` requires touching `sessions/routes.tsx`, `summary/routes.tsx`, `mcp-servers/routes.tsx` and their tests. The global middleware achieves the same security guarantee with a single insertion point and zero risk of missing a route. It also makes the system fail-closed for future routes.

**Alternative considered:** Per-route migration to Pattern A. Rejected because it is error-prone (any missed route stays unprotected) and high-churn for no net behavioral difference.

**Double-check concern:** Routes that already have `authMiddleware` (Pattern A) will run it twice — once from the global middleware and once from their own registration. This is harmless: `verifyToken` is a fast JWT decode with no I/O, and the result is the same. `c.set("user", payload)` is idempotent.

### Decision 2: Public allowlist as path prefix/exact checks in `index.tsx`

```
Exact:   /
         /health
         /api/projects/public
         /api/help
Prefix:  /auth/
         /js/
         /vendor/
         /api/mimo-mcp    ← has its own Bearer token auth
```

All other paths require a valid JWT cookie. The check happens before Hono dispatches to any router.

**Alternative considered:** A blocklist (protect only known sensitive paths). Rejected — fail-open is the problem we are fixing.

### Decision 3: `/ws/chat` fix mirrors `/ws/files` exactly

The `/ws/files` handler (lines 457-474 of `index.tsx`) already does:
1. Parse `Cookie` header for JWT token
2. `authService.verifyToken(token)` → get username
3. Verify `session.owner === username`
4. Reject with 401 if any check fails

Apply identical logic to the `/ws/chat` branch. The only difference: chat does not currently verify ownership — add that check too so a user cannot connect to another user's session chat.

**Alternative considered:** Use a signed token in the WebSocket URL query param (like `/ws/agent`). Rejected — the browser WebSocket API sends cookies automatically; no JS change needed, and the cookie is already HttpOnly.

### Decision 4: Delete `/api/test` and `protectedRoutes` without replacement

Both are dead code. `/api/test` is registered twice (Hono first-match wins, second is unreachable). `protectedRoutes` is an empty `new Hono()` mounted at `/`. No tests reference either. Safe to delete.

## Risks / Trade-offs

- **Risk: allowlist omission** — A path that should be public is accidentally left off the allowlist and starts returning 302 to authenticated users (no real harm) or blocking a legitimate unauthenticated use case (e.g., a webhook).  
  → Mitigation: The allowlist is small and explicit. Existing tests for auth routes and health will catch regressions. The MCP endpoint is explicitly allowlisted.

- **Risk: `/ws/chat` auth breaks existing browser clients** — Browsers already send the `token` cookie with WebSocket upgrade requests (same-origin). This should be transparent.  
  → Mitigation: The cookie is set with `Path=/; SameSite=Strict`, so it is included on same-origin WS upgrades. No client code change needed.

- **Risk: double-middleware performance** — Pattern A routes run `verifyToken` twice per request.  
  → Negligible: JWT verification is a local HMAC operation (~0.1ms). No I/O.

## Migration Plan

1. Apply changes to `src/index.tsx` (global middleware insertion before route registrations, WebSocket chat auth, test endpoint removal, protectedRoutes removal).
2. Delete `src/protected/routes.tsx`.
3. Run full test suite: `cd packages/mimo-platform && bun test`.
4. Verify health endpoint still returns 200 unauthenticated.
5. Verify login/register pages still render unauthenticated.
6. Verify dashboard redirects to login when unauthenticated.

**Rollback:** Revert `src/index.tsx` and restore `src/protected/routes.tsx`. No data migrations involved.

## Open Questions

- None. The scope is fully defined by the explore session findings.
