## MODIFIED Requirements

### Requirement: User can create a session

The system SHALL allow users to create sessions within a project. Each session creates repo.fossil but defers checkout creation to agent bootstrap. The session-creation form SHALL accept optional expert-mode agent+model inputs; when provided and the agent is online, an "Expert" thread is auto-created and `activeExpertThreadId` is set.

#### Scenario: Create session with title

- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates directory ~/.mimo/projects/my-app/sessions/fix-auth-bug/
- **AND** system clones project's repository to upstream/
- **AND** system imports to repo.fossil (fossil import --git or fossil clone)
- **AND** system stores session.yaml with {title: "fix-auth-bug", status: "active", port: null, activeExpertThreadId: null}
- **AND** system displays session view

#### Scenario: Create session with expert-mode defaults and agent online

- **WHEN** authenticated user submits a session with `expertAgentId: "claude-pro"` and `expertModelId: "claude-4-opus"`
- **AND** agent "claude-pro" is online
- **THEN** system creates the session record
- **AND** system creates a chat thread named "Expert" with the provided agent, model, and derived mode
- **AND** system sets `activeExpertThreadId` to the new thread's id
- **AND** system stores `activeExpertThreadId` in session.yaml

#### Scenario: Create session with expert-mode defaults and agent offline

- **WHEN** authenticated user submits a session with `expertAgentId: "claude-pro"` and `expertModelId: "claude-4-opus"`
- **AND** agent "claude-pro" is offline
- **THEN** system creates the session record
- **AND** no expert thread is created
- **AND** `activeExpertThreadId` is null in session.yaml
- **AND** the session creation succeeds without error

#### Scenario: Port assignment deferred

- **WHEN** session is created
- **THEN** system stores port: null in session.yaml
- **AND** fossil server is NOT started at creation time
- **AND** port is assigned when agent connects (see agent-lifecycle)

#### Scenario: Duplicate session title

- **WHEN** user submits session title that already exists in project
- **THEN** system appends timestamp to title or returns error