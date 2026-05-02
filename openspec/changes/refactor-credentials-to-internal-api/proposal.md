## Why

The credentials domain manages SSH and HTTPS credentials for repository access. Creating an internal API enables credential management to be reused by different frontends while keeping sensitive credential data handling centralized.

## What Changes

- **New**: Internal API endpoints for credentials CRUD at `/api/internal/credentials/*`
- **Refactor**: `credentials/routes.tsx` becomes thin proxy layer
  - Extracts token from request
  - Forwards to internal API
  - Renders JSX response from API data
- **No breaking changes**: All existing routes continue to work identically

## Capabilities

### New Capabilities
- `internal-api-credentials`: Internal REST API for credential management (list, get, create, update, delete credentials for both HTTPS and SSH types)

### Modified Capabilities
<!-- None - this is implementation refactoring, no behavior changes -->

## Impact

- **Routes affected**: `/credentials`, `/credentials/new`, `/credentials/:id/edit`
- **Dependencies**: Requires `setup-internal-api-infrastructure` to be complete
- **Services unchanged**: Uses CredentialRepository
- **Auth**: JWT tokens forwarded from web routes to internal API
- **Security**: Credential secrets handled only in internal API layer
