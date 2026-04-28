## ADDED Requirements

### Requirement: Agent can fetch assigned sessions

The platform SHALL provide an API endpoint for agents to retrieve their assigned sessions.

#### Scenario: Fetch sessions with valid token
- **WHEN** agent sends `GET /api/agents/me/sessions` with valid JWT token in Authorization header
- **THEN** platform returns array of session objects
- **AND** each session object includes `sessionId`, `projectId`, `sessionName`, `status`, `port`
- **AND** only sessions assigned to this agent are returned

#### Scenario: Fetch sessions without token
- **WHEN** agent sends `GET /api/agents/me/sessions` without Authorization header
- **THEN** platform returns `401 Unauthorized`
- **AND** response body contains `{"error": "Missing token"}`

#### Scenario: Fetch sessions with invalid token
- **WHEN** agent sends `GET /api/agents/me/sessions` with invalid JWT token
- **THEN** platform returns `401 Unauthorized`
- **AND** response body contains `{"error": "Invalid token"}`

#### Scenario: No assigned sessions
- **WHEN** agent has no sessions assigned
- **THEN** platform returns empty array `[]`