## ADDED Requirements

### Requirement: User can close a session

The system SHALL allow users to mark a session as closed (read-only, no more interactions) and optionally capture a reason for closing. The close form presents a radio group (`implemented`, `invalid expectations`, `wrong implementation`, `no reason`) and an optional free-text note. The stored `closeReason` is the note when typed, otherwise the selected radio label; `no reason` with an empty note stores no reason. The radio label and note are never combined.

#### Scenario: Close session with a radio selection

- **WHEN** authenticated user submits the close form with `implemented` selected and an empty note
- **THEN** system updates session status to "closed"
- **AND** system stores `closeReason: "implemented"` in session.yaml
- **AND** system redirects to session detail page

#### Scenario: Note overrides radio selection

- **WHEN** authenticated user submits the close form with `wrong implementation` selected and the note "used the wrong API"
- **THEN** system updates session status to "closed"
- **AND** system stores `closeReason: "used the wrong API"` in session.yaml
- **AND** system redirects to session detail page

#### Scenario: Close session without a reason

- **WHEN** authenticated user submits the close form with `no reason` selected and an empty note
- **THEN** system updates session status to "closed"
- **AND** system stores `closeReason: undefined` in session.yaml
- **AND** system redirects to session detail page

#### Scenario: Cancel close returns to session detail

- **WHEN** authenticated user cancels close operation
- **THEN** system redirects to session detail page without changing session status

#### Scenario: Prevent interaction with closed session

- **WHEN** session has status "closed"
- **THEN** system rejects new chat messages with 403 Forbidden
- **AND** system displays session as read-only in UI
