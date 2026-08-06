## MODIFIED Requirements

### Requirement: Session supports an optional agent working directory subpath

The system SHALL allow users to specify an optional workspace-relative directory when creating a session. When set, the agent's ACP process SHALL be initialized with that directory as its working directory. The directory SHALL be validated to remain inside the agent workspace.

#### Scenario: Session created with workspace-relative directory

- **WHEN** a user creates a session with relative directory "backend/packages/api"
- **THEN** the system stores the workspace-relative directory in session state
- **AND** the agent initializes its ACP process with cwd equal to `{agentWorkspacePath}/backend/packages/api`

#### Scenario: Session created without relative directory

- **WHEN** a user creates a session without specifying a relative directory
- **THEN** the system initializes the ACP process with cwd equal to `{agentWorkspacePath}`

#### Scenario: Relative directory is passed through session_ready

- **WHEN** the platform sends a `session_ready` message to the agent
- **AND** the session has a relative directory set
- **THEN** the message includes the workspace-relative directory value

#### Scenario: Invalid relative directory rejected

- **WHEN** a user creates a session with a relative directory that escapes the agent workspace
- **THEN** the system rejects session creation with a validation error
