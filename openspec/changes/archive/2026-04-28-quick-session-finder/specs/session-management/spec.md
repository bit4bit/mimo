## ADDED Requirements

### Requirement: Sessions are searchable by query
The system SHALL expose an authenticated endpoint to search sessions by name or project name across all projects owned by the authenticated user.

#### Scenario: Search with query
- **WHEN** authenticated user sends `GET /sessions/search?q=auth`
- **THEN** system returns sessions where session name OR project name contains "auth" (case-insensitive)
- **AND** response includes `sessionId`, `sessionName`, `projectId`, `projectName`, `status` for each match

#### Scenario: Empty query returns recent sessions
- **WHEN** authenticated user sends `GET /sessions/search` with no `q` parameter or empty `q`
- **THEN** system returns up to 10 sessions sorted by last activity descending

#### Scenario: Results scoped to owner
- **WHEN** authenticated user sends `GET /sessions/search?q=`
- **THEN** system returns only sessions owned by the authenticated user
- **AND** sessions belonging to other users are never included

#### Scenario: Unauthenticated request rejected
- **WHEN** unauthenticated request is sent to `GET /sessions/search`
- **THEN** system returns 401 Unauthorized
