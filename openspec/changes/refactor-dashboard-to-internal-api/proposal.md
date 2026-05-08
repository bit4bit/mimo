## Why

The dashboard aggregates data from multiple sources (projects, agents, sessions). Creating an internal API endpoint for dashboard data provides a single aggregation point that can be consumed by any frontend.

## What Changes

- **New**: Internal API endpoint for dashboard data at `/api/internal/dashboard`
- **New**: Aggregates projects, agents, and recent sessions in one response
- **Refactor**: `dashboard/routes.tsx` becomes thin proxy layer
  - Calls internal API for dashboard data
  - Renders DashboardPage component with API response
- **No breaking changes**: Dashboard continues to work identically

## Capabilities

### New Capabilities

- `internal-api-dashboard`: Internal REST API for dashboard data aggregation

### Modified Capabilities

<!-- None - this is implementation refactoring -->

## Impact

- **Routes affected**: `/dashboard`
- **Dependencies**: Requires `setup-internal-api-infrastructure` to be complete
- **Services unchanged**: Uses ProjectRepository, AgentRepository, SessionRepository
- **Performance**: Same aggregation logic, just moved to API layer
