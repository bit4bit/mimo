## MODIFIED Requirements

### Requirement: User can create a session
The system SHALL allow users to create sessions within a project. Each session creates repo.fossil but defers checkout creation to agent bootstrap. Session creation does NOT require agent selection.

#### Scenario: Create session with title
- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates directory ~/.mimo/projects/my-app/sessions/fix-auth-bug/
- **AND** system clones project's repository to upstream/
- **AND** system imports to repo.fossil (fossil import --git or fossil clone)
- **AND** system stores session.yaml with {title: "fix-auth-bug", status: "active", port: null}
- **AND** system displays session view
- **AND** system does NOT require or store assignedAgentId at creation time

#### Scenario: Port assignment deferred
- **WHEN** session is created
- **THEN** system stores port: null in session.yaml
- **AND** fossil server is NOT started at creation time
- **AND** port is assigned when agent connects (see agent-lifecycle)

#### Scenario: Duplicate session title
- **WHEN** user submits session title that already exists in project
- **THEN** system appends timestamp to title or returns error

## ADDED Requirements

### Requirement: Chat thread stores assigned agent
The system SHALL store `assignedAgentId` on each chat thread, allowing threads within the same session to use different agents.

#### Scenario: Thread created with agent
- **WHEN** user submits thread creation with `{ name, model, mode, assignedAgentId }`
- **THEN** system creates thread with all four fields persisted
- **AND** if agent is online, system sends `session_ready` to that agent for this thread

#### Scenario: Thread created without agent
- **WHEN** user submits thread creation without `assignedAgentId`
- **THEN** system creates thread with `assignedAgentId: null`
- **AND** no `session_ready` notification is sent

#### Scenario: Threads in same session use different agents
- **WHEN** session has thread A with agentId "agent-1" and thread B with agentId "agent-2"
- **THEN** each thread maintains its own ACP session independently
- **AND** switching between threads activates the respective agent's ACP session

## REMOVED Requirements

### Requirement: Session creation requires agent selection
**Reason**: Agent assignment now happens at thread creation time, enabling threads within a session to independently own their agent.
**Migration**: Remove `assignedAgentId` from session creation form and POST handler. Existing sessions with `assignedAgentId` set are unaffected — the field is ignored at creation but retained for backward compatibility if present.
