## Why

The summary domain handles session summary generation by coordinating with agents. Creating an internal API enables summary functionality to be triggered from different frontends.

## What Changes

- **New**: Internal API endpoints for summary operations at `/api/internal/summary/*`
- **Refactor**: `summary/routes.tsx` becomes thin proxy layer
  - Proxies summary refresh and retrieval to internal API
- **No breaking changes**: All existing routes continue to work identically

## Capabilities

### New Capabilities
- `internal-api-summary`: Internal REST API for session summary operations (refresh summary, get latest summary)

### Modified Capabilities
<!-- None - this is implementation refactoring -->

## Impact

- **Routes affected**: `/summary/refresh`, `/summary/latest`
- **Dependencies**: Requires `setup-internal-api-infrastructure` to be complete
- **Services unchanged**: Uses ChatService, AgentService
- **Agent coordination**: Summary generation still requires active agent connection
