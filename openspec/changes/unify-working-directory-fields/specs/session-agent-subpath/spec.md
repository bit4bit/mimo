## MODIFIED Requirements

### Requirement: Session supports an optional agent working directory subpath

The system SHALL allow users to specify a single optional working directory when creating a session. The value SHALL be workspace-relative: for single-repository projects the workspace root equals the repository root, and for multi-repository projects the value MAY include a repository mount path. When set, the agent's ACP process SHALL be initialized with that directory as its working directory. The directory SHALL be validated to remain inside the agent workspace.

The session creation form SHALL expose a single "Working directory" input. The system SHALL NOT present separate `agentSubpath` (repo-relative) and `relativeDir` (workspace-relative) inputs. Internally, the platform MAY store the resolved value in `agentSubpath` and `relativeDir` fields, but the form and session settings page SHALL present only one field to the user.

#### Scenario: Single-repo session created with working directory

- **WHEN** a user creates a session in a single-repository project with working directory set to `"packages/backend"`
- **THEN** the system SHALL store the working directory in session state
- **AND** the agent SHALL initialize its ACP process with cwd equal to `{agentWorkspacePath}/packages/backend`

#### Scenario: Multi-repo session created with working directory including mount path

- **WHEN** a user creates a session in a multi-repository project with working directory set to `"repo-a/packages/app"`
- **THEN** the system SHALL store the working directory in session state
- **AND** the agent SHALL initialize its ACP process with cwd equal to `{agentWorkspacePath}/repo-a/packages/app`

#### Scenario: Session created without working directory

- **WHEN** a user creates a session without specifying a working directory
- **THEN** the system SHALL initialize the ACP process with cwd equal to `{agentWorkspacePath}`
- **AND** behavior SHALL be identical to leaving both legacy fields empty

#### Scenario: Working directory is passed through session_ready

- **WHEN** the platform sends a `session_ready` message to the agent
- **AND** the session has a working directory set
- **THEN** the message SHALL include the working directory value

#### Scenario: Invalid working directory rejected

- **WHEN** a user creates a session with a working directory that escapes the agent workspace
- **THEN** the system SHALL reject session creation with a validation error

#### Scenario: Session settings page shows single working directory

- **WHEN** a user views the read-only session settings page for a session that has a working directory set
- **THEN** the page SHALL display a single "Working directory" row
- **AND** SHALL NOT display separate "Agent working directory" and "Workspace directory" rows