## ADDED Requirements

### Requirement: Internal API router infrastructure

The system SHALL provide a dedicated internal API router mounted at `/api/internal/*` that routes requests to domain-specific handlers.

#### Scenario: Request reaches internal API

- **WHEN** a request is made to `/api/internal/{domain}/{action}`
- **THEN** the request SHALL be routed to the appropriate domain handler
- **AND** the response SHALL be returned as JSON

### Requirement: JWT authentication forwarding

The system SHALL forward JWT tokens from the web layer to the internal API layer using the Authorization header.

#### Scenario: Authenticated request flows through proxy

- **WHEN** a web route receives a request with a valid JWT token
- **AND** the web route proxies the request to the internal API
- **THEN** the internal API SHALL receive the token in the Authorization header
- **AND** the internal API SHALL validate the token before processing

### Requirement: Standardized response format

The system SHALL use a consistent JSON response format for all internal API endpoints with status, data, and error fields.

#### Scenario: Successful internal API response

- **WHEN** an internal API handler completes successfully
- **THEN** it SHALL return a JSON response with `{ success: true, data: {...} }`

#### Scenario: Failed internal API response

- **WHEN** an internal API handler encounters an error
- **THEN** it SHALL return a JSON response with `{ success: false, error: "message" }`
- **AND** an appropriate HTTP status code (400, 401, 403, 404, 500)

### Requirement: Service injection into handlers

The system SHALL provide access to MimoContext services within internal API handlers through dependency injection.

#### Scenario: Handler accesses services

- **WHEN** an internal API handler needs to call a service
- **THEN** it SHALL receive the required services via its context/dependencies
- **AND** it SHALL NOT import services directly

### Requirement: Error handling standardization

The system SHALL handle errors consistently across all internal API endpoints with appropriate logging and client-friendly messages.

#### Scenario: Service throws error in handler

- **WHEN** a service throws an error during internal API processing
- **THEN** the handler SHALL catch the error
- **AND** return a standardized error response
- **AND** log the error details server-side
