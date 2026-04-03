## MODIFIED Requirements

### Requirement: User can create a session

The system SHALL allow users to create sessions within a project. Each session clones the repository, creates Fossil proxy, and prepares checkout directory.

#### Scenario: Create session with title
- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates directory `~/.mimo/projects/<project-id>/sessions/<session-id>/`
- **AND** system clones repository URL to `upstream/` directory
- **AND** system imports to Fossil: `repo.fossil` (one-time copy)
- **AND** system opens Fossil checkout to `checkout/` directory
- **AND** system stores session.yaml with `{name: "fix-auth-bug", status: "active"}`
- **AND** system displays session view

#### Scenario: Clone from Git repository
- **WHEN** project has `repoType: "git"`
- **THEN** system executes `git clone <repoUrl> upstream/`
- **AND** system executes `fossil import --git upstream/.git repo.fossil`
- **AND** system executes `fossil open repo.fossil checkout/`

#### Scenario: Clone from Fossil repository
- **WHEN** project has `repoType: "fossil"`
- **THEN** system executes `fossil clone <repoUrl> upstream/.fossil`
- **AND** system executes `fossil clone upstream/.fossil repo.fossil`
- **AND** system executes `fossil open repo.fossil checkout/`

#### Scenario: Clone failure
- **WHEN** repository clone fails (invalid URL, auth required, network error)
- **THEN** system returns error `CLONE_FAILED`
- **AND** session is not created

#### Scenario: Import failure
- **WHEN** Fossil import fails
- **THEN** system returns error `IMPORT_FAILED`
- **AND** session is not created

#### Scenario: Duplicate session title
- **WHEN** user submits session title that already exists in project
- **THEN** system returns error `SESSION_EXISTS`

### Requirement: Session directory structure

The system SHALL maintain complete session directory structure.

#### Scenario: Complete session structure
- **WHEN** session creation succeeds
- **THEN** session directory contains:
  - `session.yaml`: session metadata `{id, name, projectId, owner, assignedAgentId, status, port, createdAt, updatedAt}`
  - `upstream/`: original repository (git or fossil)
  - `repo.fossil`: Fossil proxy (one-time copy)
  - `checkout/`: working copy for platform changes

### Requirement: User can delete a session

The system SHALL allow users to remove sessions with full cleanup.

#### Scenario: Delete session with cleanup
- **WHEN** authenticated user deletes session "fix-auth-bug"
- **THEN** system terminates agent process if running
- **AND** system stops Fossil server if running
- **AND** system removes entire session directory including `upstream/`, `repo.fossil`, `checkout/`

## ADDED Requirements

### Requirement: Platform starts Fossil server when agent connects

The system SHALL start Fossil HTTP server on agent WebSocket connection for each assigned session.

#### Scenario: Agent connects to session
- **WHEN** agent connects via WebSocket with valid token
- **AND** agent fetches assigned sessions via `GET /api/agents/me/sessions`
- **THEN** platform starts Fossil server for each assigned session
- **AND** platform assigns port 8000-9000
- **AND** platform sends `session_ready` message to agent with `{sessionId, port}`

#### Scenario: Agent disconnects
- **WHEN** agent WebSocket closes
- **THEN** platform stops Fossil servers for all assigned sessions
- **AND** platform releases assigned ports