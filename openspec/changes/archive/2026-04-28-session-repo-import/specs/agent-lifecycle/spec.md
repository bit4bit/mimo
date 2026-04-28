## MODIFIED Requirements

### Requirement: Agent uses token for authentication

The system SHALL validate JWT tokens from agents. Token SHALL contain only `{agentId, owner}` claims.

#### Scenario: Valid token authentication
- **WHEN** agent connects with valid JWT token containing `{agentId, owner}`
- **THEN** system identifies agent from token claims
- **AND** system authorizes WebSocket connection
- **AND** agent fetches assigned sessions via `GET /api/agents/me/sessions`

#### Scenario: Invalid token rejection
- **WHEN** agent connects with invalid or expired token
- **THEN** system rejects WebSocket connection
- **AND** system logs authentication failure

#### Scenario: Token without agentId
- **WHEN** token is missing `agentId` claim
- **THEN** system rejects connection with error `INVALID_TOKEN`

### Requirement: Agent can work on multiple sessions

The system SHALL support one agent working on multiple sessions simultaneously.

#### Scenario: Agent assigned to multiple sessions
- **WHEN** agent.yaml contains `sessionIds: ["session1", "session2"]`
- **THEN** agent receives all sessions from `GET /api/agents/me/sessions`
- **AND** platform starts Fossil servers for all assigned sessions
- **AND** agent can clone and work on all sessions

#### Scenario: Assign session to agent
- **WHEN** user assigns session "fix-auth-bug" to agent "agent-123"
- **THEN** system appends sessionId to agent.yaml `sessionIds` array
- **AND** session.yaml `assignedAgentId` is set to "agent-123"

#### Scenario: Unassign session from agent
- **WHEN** user unassigns session from agent
- **THEN** system removes sessionId from agent.yaml `sessionIds` array
- **AND** session.yaml `assignedAgentId` is set to null

### Requirement: Agent persists across disconnects

The system SHALL maintain agent process when user disconnects.

#### Scenario: Agent continues after disconnect
- **WHEN** user disconnects from session
- **THEN** mimo-agent process continues running
- **AND** agent continues working on assigned tasks

#### Scenario: Agent reports changes after reconnect
- **WHEN** user reconnects after agent made file changes
- **THEN** system receives buffered change notifications
- **AND** system updates file tree with changes