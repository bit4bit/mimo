## Why

The auth domain handles user authentication (login, logout, registration). Creating an internal API separates authentication logic from the web presentation layer, enabling different authentication interfaces.

## What Changes

- **New**: Internal API endpoints for authentication at `/api/internal/auth/*`
- **Refactor**: `auth/routes.tsx` becomes thin proxy layer
  - Login form submission proxied to internal API
  - Registration proxied to internal API
  - Logout handled in routes (cookie clearing)
- **No breaking changes**: All existing routes continue to work identically

## Capabilities

### New Capabilities

- `internal-api-auth`: Internal REST API for authentication (login, logout, register, token verification)

### Modified Capabilities

<!-- None - this is implementation refactoring -->

## Impact

- **Routes affected**: `/auth/login`, `/auth/logout`, `/auth/register`
- **Dependencies**: Requires `setup-internal-api-infrastructure` to be complete
- **Services unchanged**: Uses JwtService, UserRepository
- **Cookies**: Cookie handling stays in routes layer (internal API returns tokens, routes set cookies)
