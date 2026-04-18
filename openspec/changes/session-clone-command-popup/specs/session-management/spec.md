## MODIFIED Requirements

### Requirement: User can create a session
The system SHALL allow users to create sessions within a project. Each session creates repo.fossil but defers checkout creation to agent bootstrap, and provisions a Fossil workspace user `dev` with a generated password persisted in session data.

#### Scenario: Create session with title
- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates directory ~/.mimo/projects/my-app/sessions/fix-auth-bug/
- **AND** system clones project's repository to upstream/
- **AND** system imports to repo.fossil (fossil import --git or fossil clone)
- **AND** system stores session.yaml with {title: "fix-auth-bug", status: "active", port: null}
- **AND** system displays session view

#### Scenario: Session creation provisions dev workspace credentials
- **WHEN** session is created successfully
- **THEN** system creates Fossil user `dev` in the session repository
- **AND** system generates a random password for `dev`
- **AND** system grants `dev` full repository permissions (including clone/open, sync, check-in, and admin operations)
- **AND** system persists `agentWorkspaceUser: "dev"` and `agentWorkspacePassword: <generated-password>` in session data

#### Scenario: Port assignment deferred
- **WHEN** session is created
- **THEN** system stores port: null in session.yaml
- **AND** fossil server is NOT started at creation time
- **AND** port is assigned when agent connects (see agent-lifecycle)

#### Scenario: Duplicate session title
- **WHEN** user submits session title that already exists in project
- **THEN** system appends timestamp to title or returns error

## ADDED Requirements

### Requirement: Existing sessions can be backfilled with dev workspace credentials
The system SHALL provide a migration script to create missing `dev` workspace credentials for sessions created before this change.

#### Scenario: Migration backfills missing credentials
- **WHEN** operator runs migration script
- **AND** a session has missing `agentWorkspaceUser` and/or `agentWorkspacePassword`
- **THEN** migration ensures Fossil user `dev` exists in that session repository
- **AND** migration generates and stores a password when missing
- **AND** migration persists `agentWorkspaceUser: "dev"` and `agentWorkspacePassword` in session data

#### Scenario: Migration is idempotent
- **WHEN** operator runs migration script multiple times
- **THEN** sessions already containing valid `dev` credentials are not duplicated
- **AND** existing stored passwords are preserved unless they are missing
- **AND** migration reports per-session status (updated, skipped, failed)
