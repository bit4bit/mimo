## ADDED Requirements

### Requirement: Session supports an optional agent working directory subpath
The system SHALL allow users to specify an optional subpath relative to the repository root when creating a session. When set, the agent's ACP process SHALL be initialized with that subdirectory as its working directory.

#### Scenario: Session created with agentSubpath
- **WHEN** a user creates a session with `agentSubpath` set to `"packages/backend"`
- **THEN** the system SHALL store `agentSubpath: "packages/backend"` in `session.yaml`
- **AND** the agent SHALL initialize its ACP process with cwd equal to `{checkoutPath}/packages/backend`

#### Scenario: Session created without agentSubpath
- **WHEN** a user creates a session without specifying `agentSubpath`
- **THEN** the system SHALL initialize the ACP process with cwd equal to `{checkoutPath}` (repository root)
- **AND** behavior SHALL be identical to before this change

#### Scenario: agentSubpath is passed through session_ready
- **WHEN** the platform sends a `session_ready` message to the agent
- **AND** the session has an `agentSubpath` set
- **THEN** the message SHALL include the `agentSubpath` value
