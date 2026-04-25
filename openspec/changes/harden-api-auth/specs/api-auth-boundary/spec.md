## ADDED Requirements

### Requirement: All HTTP routes require authentication by default
The platform SHALL reject any HTTP request to a non-allowlisted path that does not carry a valid JWT in the `token` cookie. Rejected requests SHALL be redirected to `/auth/login` with HTTP 302.

#### Scenario: Unauthenticated request to protected route
- **WHEN** a client sends a request to `/sessions/abc` without a `token` cookie
- **THEN** the system responds with HTTP 302 redirecting to `/auth/login`

#### Scenario: Authenticated request to protected route
- **WHEN** a client sends a request to `/sessions/abc` with a valid `token` cookie
- **THEN** the system processes the request normally

#### Scenario: Expired JWT rejected
- **WHEN** a client sends a request with an expired `token` cookie
- **THEN** the system responds with HTTP 302 redirecting to `/auth/login`

### Requirement: Public allowlist exempts minimal paths from authentication
The platform SHALL allow unauthenticated access to the following paths only:
- `GET /` (landing page)
- `GET /health`
- `GET /api/projects/public`
- `GET /api/help`
- All paths under `/auth/` (login, register, logout)
- All paths under `/js/` and `/vendor/` (static assets)
- All paths under `/api/mimo-mcp` (uses its own Bearer token auth)

#### Scenario: Health check is publicly accessible
- **WHEN** an unauthenticated client sends `GET /health`
- **THEN** the system responds with HTTP 200

#### Scenario: Login page is publicly accessible
- **WHEN** an unauthenticated client sends `GET /auth/login`
- **THEN** the system responds with HTTP 200 rendering the login page

#### Scenario: Static assets are publicly accessible
- **WHEN** an unauthenticated client requests `/js/app.js`
- **THEN** the system responds with the asset without requiring authentication

#### Scenario: MCP endpoint uses its own auth
- **WHEN** a client sends `POST /api/mimo-mcp` with a valid Bearer token but no JWT cookie
- **THEN** the system does not reject at the global auth layer and the MCP handler processes the request

### Requirement: No unauthenticated debug endpoints exist
The platform SHALL NOT expose any route that returns diagnostic or test data without authentication.

#### Scenario: Test endpoint removed
- **WHEN** any client sends `GET /api/test`
- **THEN** the system responds with HTTP 404
