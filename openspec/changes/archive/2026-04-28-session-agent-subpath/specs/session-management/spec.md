## MODIFIED Requirements

### Requirement: User can create a session
The system SHALL allow users to create sessions within a project. Each session creates repo.fossil but defers checkout creation to agent bootstrap. Sessions MAY include an optional `agentSubpath` to scope the agent's starting working directory to a subdirectory of the repository.

#### Scenario: Create session with title
- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates directory ~/.mimo/projects/my-app/sessions/fix-auth-bug/
- **AND** system clones project's repository to upstream/
- **AND** system imports to repo.fossil (fossil init + open + commit)
- **AND** system stores session.yaml with {title: "fix-auth-bug", status: "active", port: null}
- **AND** system displays session view

#### Scenario: Create session with agentSubpath
- **WHEN** authenticated user submits session title "fix-api" with agentSubpath "packages/api"
- **THEN** system stores session.yaml with {title: "fix-api", agentSubpath: "packages/api", status: "active", port: null}

#### Scenario: Port assignment deferred
- **WHEN** session is created
- **THEN** system stores port: null in session.yaml
- **AND** fossil server is NOT started at creation time
- **AND** port is assigned when agent connects (see agent-lifecycle)

#### Scenario: Duplicate session title
- **WHEN** user submits session title that already exists in project
- **THEN** system appends timestamp to title or returns error
