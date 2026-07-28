## ADDED Requirements

### Requirement: User pinned-sessions persistence

The system SHALL persist each user's ordered list of pinned sessions under that user's data directory (`~/.mimo/users/<username>/pinned-sessions.yaml`), independent of credentials and auth tokens.

#### Scenario: Pin file created on first pin

- **WHEN** a user with no existing pin file pins their first session
- **THEN** system creates `~/.mimo/users/<username>/pinned-sessions.yaml` containing the single ordered entry

#### Scenario: Pin file is personal

- **WHEN** user "alice" pins a session
- **THEN** the pin is recorded only under `~/.mimo/users/alice/pinned-sessions.yaml`
- **AND** user "bob"'s pin store is unaffected

#### Scenario: Pin file survives logout

- **WHEN** a user logs out and back in
- **THEN** system reads the same `pinned-sessions.yaml` and returns the same ordered list