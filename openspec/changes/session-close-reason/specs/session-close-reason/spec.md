## ADDED Requirements

### Requirement: User can close a session with a reason
The system SHALL allow users to close a session and optionally provide a reason for closing.

#### Scenario: Close page displays session name and reason form
- **WHEN** authenticated user navigates to `GET /projects/:projectId/sessions/:id/close`
- **THEN** system displays session name and a form with a text input for close reason
- **AND** form POSTs to `/projects/:projectId/sessions/:id/close`

#### Scenario: Close with reason persists to session
- **WHEN** authenticated user submits close form with reason "Completed feature X"
- **THEN** system updates session status to "closed"
- **AND** system stores `closeReason: "Completed feature X"` in session.yaml
- **AND** system redirects to the session detail page

#### Scenario: Close without reason is allowed
- **WHEN** authenticated user submits close form with empty reason
- **THEN** system updates session status to "closed"
- **AND** system stores `closeReason: undefined` (or empty string)
- **AND** system redirects to the session detail page

#### Scenario: Cancel returns to session detail
- **WHEN** authenticated user clicks Cancel on close page
- **THEN** system redirects to the session detail page without changing session status

#### Scenario: Close reason is visible in session list
- **GIVEN** session has status "closed" and closeReason "Refactored auth"
- **WHEN** user views the project sessions list page
- **THEN** system displays the close reason next to or below the "closed" status badge

## MODIFIED Requirements

### Requirement: User can close a session
The system SHALL allow users to mark a session as closed (read-only, no more interactions).

#### Scenario: Close session via POST
- **WHEN** authenticated user POSTs to `/sessions/:id/close` or `/projects/:projectId/sessions/:id/close`
- **THEN** system updates session status to "closed"
- **AND** system stores optional `closeReason` from request body if provided
- **AND** system redirects to the session detail page

#### Scenario: Prevent interaction with closed session
- **WHEN** session has status "closed"
- **THEN** system rejects new chat messages with 403 Forbidden
- **AND** system displays session as read-only in UI
