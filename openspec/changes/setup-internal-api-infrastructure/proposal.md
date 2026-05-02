## Why

Before refactoring individual domains to use the internal API, we need the foundational infrastructure in place. This includes the base router, authentication forwarding mechanism, and standardized response utilities that all domain APIs will depend on.

## What Changes

- **New**: `/api/internal/*` router mounted in the main Hono app
- **New**: JWT token forwarding from web layer to internal API via Authorization header
- **New**: Standardized JSON response utilities (success/error formats)
- **New**: Shared types and interfaces for internal API handlers
- **New**: Internal API context type with MimoContext injection

## Capabilities

### New Capabilities
- `internal-api-infrastructure`: Core infrastructure for the internal REST API layer including routing, auth forwarding, and response standardization

### Modified Capabilities
<!-- None - this is pure infrastructure addition -->

## Impact

- **New files**: `src/api/internal/shared/*`, `src/api/internal/index.ts`
- **Modified files**: `src/index.tsx` (mount the internal API router)
- **No breaking changes**: This only adds new routes, doesn't change existing behavior
- **Dependencies**: All future domain refactors depend on this change
