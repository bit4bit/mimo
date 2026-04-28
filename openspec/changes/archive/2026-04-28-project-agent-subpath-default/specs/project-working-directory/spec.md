## ADDED Requirements

### Requirement: Project can declare a default agent working directory
The system SHALL allow a project to optionally declare an `agentSubpath` — a relative path within the repository that becomes the default working directory for agent sessions.

#### Scenario: Create project with agentSubpath
- **WHEN** authenticated user creates a project with `agentSubpath` set to "packages/backend"
- **THEN** system stores the project with `agentSubpath: "packages/backend"`

#### Scenario: Create project without agentSubpath
- **WHEN** authenticated user creates a project without specifying `agentSubpath`
- **THEN** system stores the project without `agentSubpath`
- **AND** sessions default to the repository root

### Requirement: Sessions inherit project agentSubpath unless overridden
The system SHALL resolve the effective `agentSubpath` for a new session as: non-empty session-level value → project default → undefined (repository root).

#### Scenario: Session inherits project agentSubpath
- **WHEN** project has `agentSubpath: "packages/backend"`
- **AND** user creates a session without specifying `agentSubpath`
- **THEN** session is stored with `agentSubpath: "packages/backend"`

#### Scenario: Session overrides project agentSubpath
- **WHEN** project has `agentSubpath: "packages/backend"`
- **AND** user creates a session with `agentSubpath: "packages/api"`
- **THEN** session is stored with `agentSubpath: "packages/api"`

#### Scenario: Empty string does not override project default
- **WHEN** project has `agentSubpath: "packages/backend"`
- **AND** user creates a session with `agentSubpath` set to an empty string
- **THEN** session is stored with `agentSubpath: "packages/backend"`

#### Scenario: No project default and no session value
- **WHEN** project has no `agentSubpath`
- **AND** user creates a session without specifying `agentSubpath`
- **THEN** session is stored without `agentSubpath`
- **AND** agent works from repository root

### Requirement: Project agentSubpath is not editable after creation
The system SHALL NOT allow `agentSubpath` to be changed after a project is created.

#### Scenario: Update project does not change agentSubpath
- **WHEN** authenticated user updates a project (name, description, credential, etc.)
- **THEN** system does not accept or apply `agentSubpath` changes
- **AND** project retains its original `agentSubpath` value
