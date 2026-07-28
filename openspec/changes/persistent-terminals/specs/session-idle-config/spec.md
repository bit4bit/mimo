# Spec Delta: session-idle-config

## ADDED Requirements

### Requirement: Live terminals count as session activity and veto idle actions

A session with at least one terminal whose process is running SHALL NOT be considered idle. Terminal I/O (spawn, stdin, stdout) SHALL reset the session idle timer, and idle-triggered actions (ACP thread parking, TTL auto-delete) SHALL be skipped while a session has live terminals.

#### Scenario: Terminal input resets idle timer

- **GIVEN** a session with a live terminal and a configured `idleTimeoutMs` greater than 0
- **WHEN** the user types into the terminal
- **THEN** the session idle timer SHALL be reset to the full `idleTimeoutMs`

#### Scenario: Terminal output resets idle timer

- **GIVEN** a session with a live terminal and a configured `idleTimeoutMs` greater than 0
- **WHEN** the terminal process produces stdout output
- **THEN** the session idle timer SHALL be reset to the full `idleTimeoutMs`

#### Scenario: Parking skipped with live terminals

- **GIVEN** a session with at least one live terminal process
- **WHEN** the session idle timer fires
- **THEN** ACP thread parking SHALL be skipped
- **AND** the idle timer SHALL be restarted

#### Scenario: Parking proceeds with no live terminals

- **GIVEN** a session whose terminals are all exited (`dead`) or which has no terminals
- **WHEN** the session idle timer fires
- **THEN** ACP thread parking SHALL proceed as before

#### Scenario: TTL auto-delete skipped with active terminals

- **GIVEN** a session past its TTL that has at least one terminal in state `active`
- **WHEN** the TTL auto-delete evaluation runs
- **THEN** the session SHALL NOT be auto-deleted
- **AND** the session SHALL become eligible again once all its terminals are `dead` or removed
