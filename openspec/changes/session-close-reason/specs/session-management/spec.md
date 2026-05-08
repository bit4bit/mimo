## ADDED Requirements

### Requirement: User can close a session

The system SHALL allow users to mark a session as closed (read-only, no more interactions) and optionally capture a reason for closing.

#### Scenario: Close session with reason

- **WHEN** authenticated user submits close form with reason "Completed successfully"
- **THEN** system updates session status to "closed"
- **AND** system stores `closeReason: "Completed successfully"` in session.yaml
- **AND** system redirects to session detail page

#### Scenario: Close session without reason

- **WHEN** authenticated user submits close form with empty reason
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
