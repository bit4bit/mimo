## MODIFIED Requirements

### Requirement: Sessions inherit project agentSubpath unless overridden

The system SHALL resolve the effective working directory for a new session as: non-empty session-level working directory (form value) → project `agentSubpath` default → undefined (repository/workspace root). The session creation form SHALL pre-fill the single "Working directory" input with the project's `agentSubpath` default when no session-level value is provided.

#### Scenario: Session inherits project agentSubpath via single field

- **WHEN** project has `agentSubpath: "packages/backend"`
- **AND** user creates a session without specifying a working directory
- **THEN** session is stored with the effective working directory `packages/backend`

#### Scenario: Session overrides project agentSubpath via single field

- **WHEN** project has `agentSubpath: "packages/backend"`
- **AND** user creates a session with working directory set to `"packages/api"`
- **THEN** session is stored with the effective working directory `packages/api`

#### Scenario: Empty string does not override project default

- **WHEN** project has `agentSubpath: "packages/backend"`
- **AND** user creates a session with the working directory set to an empty string
- **THEN** session is stored with the effective working directory `packages/backend`

#### Scenario: No project default and no session value

- **WHEN** project has no `agentSubpath`
- **AND** user creates a session without specifying a working directory
- **THEN** session is stored without a working directory
- **AND** agent works from the repository/workspace root