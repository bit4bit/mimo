## ADDED Requirements

### Requirement: Internal API router mounting
The system SHALL mount an internal API router at `/api/internal/*` that handles all internal API requests.

#### Scenario: Request to internal API
- **WHEN** a request is made to `/api/internal/{path}`
- **THEN** the request SHALL be routed to the internal API handler
- **AND** the response SHALL be JSON

### Requirement: JWT token forwarding
The system SHALL forward JWT tokens from the web layer to the internal API via the Authorization header.

#### Scenario: Authenticated request flows through
- **WHEN** an authenticated request reaches the internal API
- **THEN** the token SHALL be validated
- **AND** the user context SHALL be available to handlers

### Requirement: Standardized response format
The system SHALL return consistent JSON responses with success, data, and error fields.

#### Scenario: Successful internal API call
- **WHEN** an internal API handler completes successfully
- **THEN** it SHALL return `{ success: true, data: {...} }`

#### Scenario: Failed internal API call
- **WHEN** an internal API handler encounters an error
- **THEN** it SHALL return `{ success: false, error: "..." }` with appropriate HTTP status

### Requirement: Service injection
The system SHALL inject MimoContext services into internal API handlers.

#### Scenario: Handler accesses services
- **WHEN** an internal API handler needs to call a service
- **THEN** it SHALL receive services via its context
