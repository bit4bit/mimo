## ADDED Requirements

### Requirement: Session idle timeout is configurable per session
The system SHALL allow users to configure the idle timeout duration for each session individually.

#### Scenario: Default idle timeout
- **GIVEN** a newly created session without explicit idle timeout configuration
- **THEN** the session SHALL have a default `idleTimeoutMs` of 600000 (10 minutes)

#### Scenario: Update idle timeout via API
- **GIVEN** an existing session
- **WHEN** a PATCH request is made to `/sessions/:id/config` with `{ idleTimeoutMs: 120000 }`
- **THEN** the session's `idleTimeoutMs` SHALL be updated to 120000
- **AND** the change SHALL be persisted to disk
- **AND** the active idle timer SHALL be reset with the new duration

#### Scenario: Idle timeout constraints
- **GIVEN** a request to update idle timeout
- **WHEN** the provided `idleTimeoutMs` is less than 10000 (10 seconds)
- **THEN** the system SHALL reject the request with a validation error
- **AND** the minimum allowed idle timeout SHALL be 10000 milliseconds

#### Scenario: Idle timeout of zero disables parking
- **GIVEN** a session with `idleTimeoutMs` set to 0
- **THEN** the ACP session SHALL never be automatically parked
- **AND** the ACP process SHALL remain active indefinitely
