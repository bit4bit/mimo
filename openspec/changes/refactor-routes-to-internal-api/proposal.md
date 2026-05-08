## Why

Currently, mimo-platform routes mix HTML rendering with direct service calls, tightly coupling the web layer to business logic. This prevents multiple frontends from consuming the same API and makes the system harder to test and maintain. We need to decouple the web interface from data operations.

## What Changes

- **New**: Internal REST API layer at `/api/internal/*` with JSON endpoints for all domain operations
- **New**: JWT token-based authentication reuse between web layer and internal API
- **Refactor**: HTML routes become thin proxies that forward requests to internal API and render JSX responses
- **Refactor**: Business logic moves from route handlers to internal API handlers
- **Refactor**: API-only routes (files, commits, sync) remain unchanged as they already return JSON
- **No Breaking Changes**: All existing HTTP routes remain functional with same behavior

## Capabilities

### New Capabilities

- `internal-api-layer`: Provides internal REST API infrastructure with standardized request/response handling, auth forwarding, and service delegation for projects, sessions, agents, dashboard, credentials, config, and auth domains

### Modified Capabilities

<!-- This is implementation refactoring. No spec-level requirements change - routes continue to work as before. -->

## Impact

- **Routes affected**: `projects/routes.tsx`, `sessions/routes.tsx`, `agents/routes.tsx`, `dashboard/routes.tsx`, `credentials/routes.tsx`, `config/routes.tsx`, `mcp-servers/routes.tsx`, `summary/routes.tsx`, `auth/routes.tsx`
- **Unchanged routes**: `files/routes.ts`, `commits/routes.ts`, `auto-commit/routes.ts`, `sync/routes.ts` (already API-only)
- **Services**: No changes to existing services - they remain injected into internal API handlers
- **Tests**: Route tests need updates to mock internal API calls instead of services
- **Dependencies**: Hono framework, JWT auth reuse
