## ADDED Requirements

### Requirement: User can close a session with a reason

The system SHALL allow users to close a session and optionally provide a reason for closing, chosen from a fixed radio group with an optional free-text note.

#### Scenario: Close page displays session name and reason form

- **WHEN** authenticated user navigates to `GET /projects/:projectId/sessions/:id/close`
- **THEN** system displays the session name and a form with a radio group of options `implemented`, `invalid expectations`, `wrong implementation`, and `no reason`
- **AND** system displays an optional free-text note input
- **AND** the form POSTs to `/projects/:projectId/sessions/:id/close`

#### Scenario: Close with a radio selection and no note stores the radio label

- **WHEN** authenticated user selects `implemented` and leaves the note empty
- **THEN** system updates session status to "closed"
- **AND** system stores `closeReason: "implemented"` in session.yaml
- **AND** system redirects to the session detail page

#### Scenario: Note overrides the radio selection when typed

- **WHEN** authenticated user selects `implemented` and types the note "shipped auth flow"
- **THEN** system updates session status to "closed"
- **AND** system stores `closeReason: "shipped auth flow"` in session.yaml
- **AND** system does NOT combine the radio label and the note into one string
- **AND** system redirects to the session detail page

#### Scenario: No reason with empty note stores no reason

- **WHEN** authenticated user selects `no reason` and leaves the note empty
- **THEN** system updates session status to "closed"
- **AND** system stores `closeReason: undefined` in session.yaml
- **AND** system redirects to the session detail page

#### Scenario: No reason with a note stores the note

- **WHEN** authenticated user selects `no reason` and types the note "duplicate session"
- **THEN** system updates session status to "closed"
- **AND** system stores `closeReason: "duplicate session"` in session.yaml
- **AND** system redirects to the session detail page

#### Scenario: Cancel returns to session detail

- **WHEN** authenticated user clicks Cancel on close page
- **THEN** system redirects to the session detail page without changing session status

#### Scenario: Close reason is visible in session list

- **GIVEN** session has status "closed" and closeReason "wrong implementation"
- **WHEN** user views the project sessions list page
- **THEN** system displays the close reason next to or below the "closed" status badge

## MODIFIED Requirements

### Requirement: User can close a session

The system SHALL allow users to mark a session as closed (read-only, no more interactions).

#### Scenario: Close session via POST

- **WHEN** authenticated user POSTs to `/sessions/:id/close` or `/projects/:projectId/sessions/:id/close` with `reason` (radio value) and optional `note`
- **THEN** system updates session status to "closed"
- **AND** system resolves `closeReason` as the trimmed `note` when non-empty, otherwise the `reason` radio label, storing `undefined` when `reason` is `no reason` and the note is empty
- **AND** system redirects to the session detail page

#### Scenario: Prevent interaction with closed session

- **WHEN** session has status "closed"
- **THEN** system rejects new chat messages with 403 Forbidden
- **AND** system displays session as read-only in UI
