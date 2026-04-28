## ADDED Requirements

### Requirement: Session can be assigned an agent
The system SHALL allow sessions to be associated with an agent via assignedAgentId field.

#### Scenario: Create session with agent assignment
- **WHEN** authenticated user creates session and selects an agent from dropdown
- **THEN** system stores session.yaml with {name, projectId, owner, assignedAgentId, ...}
- **AND** system displays agent name in session detail view

#### Scenario: Create session without agent
- **WHEN** authenticated user creates session and selects "None" or skips agent selection
- **THEN** system stores session.yaml with assignedAgentId: null
- **AND** session can have agent assigned later

#### Scenario: Agent dropdown shows user's agents
- **WHEN** user views session creation form
- **THEN** system displays dropdown with all agents owned by user
- **AND** system shows agent status (online/offline) next to each agent name
- **AND** system includes "None" option as default selection

### Requirement: Session detail shows assigned agent status
The system SHALL display the assigned agent's status in the session detail view.

#### Scenario: View session with assigned online agent
- **WHEN** user views session detail page and session has agent assigned
- **AND** agent status is "online"
- **THEN** system displays agent status badge with 🟢 icon and "online" text
- **AND** clicking badge shows agent details (token, sessions, status)

#### Scenario: View session with assigned offline agent
- **WHEN** user views session detail page and session has agent assigned
- **AND** agent status is "offline"
- **THEN** system displays agent status badge with 🔴 icon and "offline" text
- **AND** clicking badge shows agent details

#### Scenario: View session without agent
- **WHEN** user views session detail page and session has no agent assigned
- **THEN** system displays "No agent assigned" placeholder
- **AND** system shows link to assign agent

## REMOVED Requirements

### Requirement: System can terminate agent
**Reason**: Removed from session management. Agent termination is user's responsibility when running mimo-agent locally.

**Migration**: The "Kill Agent" button in session detail is replaced with agent status display. Users manage agent lifecycle independently.

## MODIFIED Requirements

### Requirement: User can create a session
The system SHALL allow users to create sessions within a project. Each session creates a worktree and optionally assigns an agent.

#### Scenario: Create session with title
- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates directory ~/.mimo/projects/my-app/sessions/fix-auth-bug/
- **AND** system clones project's repository to repo.fossil
- **AND** system assigns auto-generated port (8000-9000 range)
- **AND** system starts Fossil server on assigned port
- **AND** system stores session.yaml with {title: "fix-auth-bug", port: <assigned>, status: "active", assignedAgentId: <selected agent or null>}
- **AND** system displays session view

#### Scenario: Port collision handling
- **WHEN** system attempts to start Fossil server on occupied port
- **THEN** system tries next available port in range
- **AND** system continues until successful

#### Scenario: Duplicate session title
- **WHEN** user submits session title that already exists in project
- **THEN** system appends timestamp to title or returns error

### Requirement: Session persists across disconnects
The system SHALL maintain session state when user disconnects. Agent connection state is tracked separately.

#### Scenario: Reconnect to active session
- **WHEN** user reconnects to existing session
- **THEN** system loads chat history from messages.jsonl
- **AND** system displays current agent status (online/offline based on WebSocket state)
- **AND** system displays current file tree state

#### Scenario: Agent reconnects after disconnect
- **WHEN** agent WebSocket reconnects after disconnect
- **THEN** system restores agent to "online" status
- **AND** system resumes message handling for that agent

### Requirement: User can delete a session
The system SHALL allow users to remove sessions. Agent is not affected by session deletion.

#### Scenario: Delete session with cleanup
- **WHEN** authenticated user deletes session "fix-auth-bug"
- **THEN** system removes ~/.mimo/projects/my-app/sessions/fix-auth-bug/ directory
- **AND** system does NOT terminate agent (agent continues running locally)
- **AND** agent remains available for other sessions

#### Scenario: Delete session with assigned agent
- **WHEN** authenticated user deletes session that has assignedAgentId
- **THEN** system removes session directory
- **AND** system clears assignedAgentId reference (agent unaffected)