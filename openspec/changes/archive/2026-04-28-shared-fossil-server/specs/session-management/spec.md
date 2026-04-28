## MODIFIED Requirements

### Requirement: User can create a session
The system SHALL allow users to create sessions within a project. Each session creates repo.fossil in a centralized directory, not in the session directory.

#### Scenario: Create session with title
- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates directory ~/.mimo/projects/my-app/sessions/fix-auth-bug/
- **AND** system clones project's repository to upstream/
- **AND** system imports to ~/.mimo/session-fossils/<normalized-session-id>.fossil (NOT in session directory)
- **AND** system stores session.yaml with {title: "fix-auth-bug", status: "active", port: null, fossilPath: "~/.mimo/session-fossils/..."}
- **AND** system displays session view

#### Scenario: Session no longer stores individual port
- **WHEN** session is created
- **THEN** system stores port: null in session.yaml
- **AND** system no longer assigns a unique port per session
- **AND** all sessions share the global Fossil server port (default 8000)
- **AND** URL construction uses format `http://localhost:8000/<normalized-session-id>.fossil/`

### Requirement: User can delete a session
The system SHALL allow users to remove sessions.

#### Scenario: Delete session with shared server cleanup
- **WHEN** authenticated user deletes session "fix-auth-bug"
- **THEN** system terminates agent process if running
- **AND** system removes ~/.mimo/session-fossils/<normalized-session-id>.fossil
- **AND** system removes entire session directory including upstream/ and agent-workspace/
- **AND** system does NOT need to stop any Fossil server (shared server continues running)

### Requirement: Session stores reference to fossil repository path
The system SHALL store the path to the centralized fossil repository in session data.

#### Scenario: Accessing fossil path for a session
- **WHEN** system needs the fossil repository for session operations
- **THEN** system uses SessionRepository.getFossilPath(sessionId)
- **AND** it returns ~/.mimo/session-fossils/<normalized-session-id>.fossil
- **AND** it does not look for repo.fossil in the session directory

## REMOVED Requirements

### Requirement: System starts Fossil server on session creation
**Reason**: Single shared Fossil server handles all sessions. No per-session server startup.
**Migration**: Shared server starts once at platform startup.

### Requirement: System assigns unique port per session (8000-9000 range)
**Reason**: All sessions use the same shared server port.
**Migration**: Remove port management code. Use global FOSSIL_SERVER_PORT configuration.

### Requirement: Repo.fossil stored in session directory
**Reason**: All fossil repositories are centralized in ~/.mimo/session-fossils/ for simpler management and to enable shared server access.
**Migration**: Update code that references `sessionPath/repo.fossil` to use `SessionRepository.getFossilPath(sessionId)` or the new centralized location.
