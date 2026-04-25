## Why

The mimo-platform HTTP API has no fail-closed authentication boundary: several routers rely on a spoofable `username` cookie instead of JWT verification, the `/ws/chat` WebSocket accepts any client that knows a session UUID, and two debug endpoints remain exposed. Any new route added in the future silently inherits no protection. This change hardens the surface now and ensures all future routes are protected by default.

## What Changes

- Add a global auth middleware to `src/index.tsx` (applied before all routes) that rejects unauthenticated requests and redirects to `/auth/login`, with an explicit allowlist for the minimal public paths (login, register, landing, health, static assets, `/api/projects/public`, `/api/help`, `/api/mimo-mcp`).
- Fix `/ws/chat` WebSocket upgrade: verify the JWT cookie and session ownership before accepting the connection (mirrors the existing `/ws/files` check).
- **Remove** both `/api/test` route registrations (unprotected debug endpoints, appear twice in `index.tsx`).
- **Remove** the empty `protectedRoutes` router (`src/protected/routes.tsx` + its import and mount in `index.tsx`).

## Capabilities

### New Capabilities

- `api-auth-boundary`: Global fail-closed authentication layer for all HTTP routes and WebSocket upgrades in mimo-platform.

### Modified Capabilities

- `session-management`: `/ws/chat` WebSocket upgrade now requires authenticated session ownership.

## Impact

- `packages/mimo-platform/src/index.tsx` — global middleware insertion, WebSocket chat auth fix, test endpoint removal, protectedRoutes removal.
- `packages/mimo-platform/src/protected/routes.tsx` — deleted.
- All routes currently using Pattern B (`getAuthUsername` cookie helper): `/sessions/*`, `/api/summary/*`, `/mcp-servers/*` — gain JWT enforcement via global middleware without file-level changes.
- No external API contract changes for authenticated clients.
- Unauthenticated clients hitting any previously-unprotected route (except the allowlist) will now receive `302 → /auth/login` instead of a response.
