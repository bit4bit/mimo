## Why

The config domain manages user and system configuration settings. Creating an internal API for configuration enables the settings interface to be consumed by any frontend while centralizing validation and persistence logic.

## What Changes

- **New**: Internal API endpoints for configuration management at `/api/internal/config`
- **Refactor**: `config/routes.tsx` becomes thin proxy layer
  - Proxies config load/save/reset to internal API
  - Keeps JSX rendering for ConfigEditorPage
- **Note**: Config already has `/config/api` endpoints - these will be migrated to `/api/internal/config`
- **No breaking changes**: Existing routes continue to work, internal path changes

## Capabilities

### New Capabilities
- `internal-api-config`: Internal REST API for configuration management (get, update, reset configuration with validation)

### Modified Capabilities
<!-- None - existing /config/api will redirect to new internal endpoints -->

## Impact

- **Routes affected**: `/config`, `/config/reset`, `/config/api`
- **Dependencies**: Requires `setup-internal-api-infrastructure` to be complete
- **Services unchanged**: Uses ConfigService, configValidator
- **Validation**: Config validation stays in internal API layer
