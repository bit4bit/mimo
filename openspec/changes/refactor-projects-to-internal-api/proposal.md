## Why

The projects domain currently has HTML routes that directly call services and repositories. This tightly couples the web layer to business logic. By extracting an internal API for projects, we enable multiple frontends to consume the same project management logic.

## What Changes

- **New**: Internal API endpoints for projects CRUD at `/api/internal/projects/*`
- **New**: Internal API endpoint for listing project sessions at `/api/internal/projects/:id/sessions`
- **Refactor**: `projects/routes.tsx` becomes thin proxy layer
  - Extracts token from request
  - Forwards to internal API
  - Renders JSX response from API data
- **No breaking changes**: All existing routes continue to work identically

## Capabilities

### New Capabilities

- `internal-api-projects`: Internal REST API for project management (list, get, create, update, delete projects and list project sessions)

### Modified Capabilities

<!-- None - this is implementation refactoring, no behavior changes -->

## Impact

- **Routes affected**: `/projects`, `/projects/new`, `/projects/:id`, `/projects/:id/edit`, `/projects/:id/sessions`
- **Dependencies**: Requires `setup-internal-api-infrastructure` to be complete
- **Services unchanged**: Still uses ProjectRepository, SessionRepository, CredentialRepository
- **Auth**: JWT tokens forwarded from web routes to internal API
