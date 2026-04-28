## MODIFIED Requirements

### Requirement: User can create a session
The system SHALL allow users to create sessions within a project. Each session creates repo.fossil but defers checkout creation to agent bootstrap. Sessions SHALL include idle timeout configuration and ACP state caching.

#### Scenario: Create session with default idle timeout
- **WHEN** authenticated user creates a session
- **THEN** system creates directory ~/.mimo/projects/my-app/sessions/fix-auth-bug/
- **AND** system stores session.yaml with {
    title: "fix-auth-bug",
    status: "active",
    port: null,
    idleTimeoutMs: 600000,
    acpSessionId: null,
    modelState: null,
    modeState: null
  }

### Requirement: Session storage supports ACP configuration
The system SHALL persist ACP session configuration to disk for parking and resumption.

#### Scenario: Session caches ACP state when parked
- **GIVEN** an active session with ACP connection
- **WHEN** the session transitions to "parked" state
- **THEN** system SHALL write to session.yaml:
  - `acpSessionId`: the provider's session ID
  - `modelState`: current model configuration
  - `modeState`: current mode configuration
  - `acpStatus`: "parked"

#### Scenario: Session restores cached ACP state
- **GIVEN** a session in "parked" state with cached configuration
- **WHEN** the session transitions to "active" state
- **THEN** system SHALL read from session.yaml:
  - `acpSessionId` for resumption
  - `modelState` for restoration
  - `modeState` for restoration
  - `idleTimeoutMs` for timer configuration
