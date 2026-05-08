## ADDED Requirements

### Requirement: Sessions Routes HTTP Proxy Pattern

The system SHALL use HTTP `fetch()` calls to internal API endpoints from Sessions routes, not direct service or repository calls.

#### Scenario: Session CRUD via HTTP proxy

- **WHEN** Sessions routes need to create, read, update, or delete sessions
- **THEN** they SHALL make HTTP requests to `/api/internal/sessions/*`
- **AND** NOT call `sessionRepository` methods directly

#### Scenario: Chat operations via HTTP proxy

- **WHEN** Sessions routes need to load or save chat history
- **THEN** they SHALL make HTTP requests to `/api/internal/sessions/:id/chat`
- **AND** NOT call `chatService` methods directly

#### Scenario: Agent assignment via HTTP proxy

- **WHEN** Sessions routes need to assign an agent to a session
- **THEN** they SHALL make HTTP requests to `/api/internal/sessions/:id/assign-agent`
- **AND** NOT call `agentService` methods directly

#### Scenario: No direct repository calls remain

- **WHEN** Sessions routes are fully refactored
- **THEN** there SHALL be zero calls to `sessionRepository.*`, `chatService.*`, or `agentService.*`
- **AND** all data operations SHALL go through `/api/internal/*` endpoints

### Requirement: Token Extraction in Sessions

The system SHALL use the shared `extractTokenFromCookie()` utility in Sessions routes.

#### Scenario: Sessions route authentication

- **WHEN** any Sessions route needs to call the internal API
- **THEN** it SHALL use `extractTokenFromCookie(c)` to get the JWT token
- **AND** pass it in the Authorization header

### Requirement: Error Handling Consistency

The system SHALL handle internal API errors consistently in Sessions routes.

#### Scenario: Session creation fails

- **WHEN** creating a session via internal API returns an error
- **THEN** the route SHALL render the error page with the error message
- **AND** preserve form data for user correction

#### Scenario: Session not found

- **WHEN** fetching a session returns 404
- **THEN** the route SHALL return c.notFound() or redirect appropriately
