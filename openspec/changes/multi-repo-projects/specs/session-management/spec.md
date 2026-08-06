## MODIFIED Requirements

### Requirement: User can create a session

The system SHALL allow users to create sessions within a project. Each session SHALL materialize every configured project repository into the session upstream and agent-workspace directories using the repository mountPath.

#### Scenario: Create session with title

- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates the session directory under the project sessions path
- **AND** system clones each project repository to its mounted upstream path
- **AND** system prepares each session repository state with branch and baseline
- **AND** system stores session.yaml with multi-repository session state
- **AND** system displays session view

#### Scenario: Port assignment deferred

- **WHEN** session is created
- **THEN** system stores port: null in session.yaml
- **AND** VCS server port assignment remains deferred until agent connection

#### Scenario: Duplicate session title

- **WHEN** user submits session title that already exists in project
- **THEN** system appends timestamp to title or returns error
