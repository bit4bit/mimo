## Why

The agents domain handles agent registration, capabilities, and lifecycle management. Creating an internal API for agents allows the agent management interface to be consumed by different frontends while keeping the core logic centralized.

## What Changes

- **New**: Internal API endpoints for agents CRUD at `/api/internal/agents/*`
- **New**: Internal API endpoints for capabilities (get, refresh)
- **Refactor**: `agents/routes.tsx` becomes thin proxy layer
  - Proxies agent CRUD operations to internal API
  - Keeps JSX rendering for agent pages
- **No breaking changes**: All existing routes continue to work identically

## Capabilities

### New Capabilities
- `internal-api-agents`: Internal REST API for agent management (CRUD, capabilities)

### Modified Capabilities
<!-- None - this is implementation refactoring -->

## Impact

- **Routes affected**: `/agents`, `/agents/new`, `/agents/:id`, `/agents/:id/capabilities`
- **Dependencies**: Requires `setup-internal-api-infrastructure` to be complete
- **Services unchanged**: Uses AgentService, AgentRepository
- **Agent token handling**: Internal API endpoints validate agent tokens separately
