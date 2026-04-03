## ADDED Requirements

### Requirement: User can create an agent
The system SHALL allow users to create agents for sessions. Creating an agent generates a token and spawns mimo-agent process.

#### Scenario: Create agent for session
- **WHEN** authenticated user creates agent for session "fix-auth-bug"
- **THEN** system generates JWT token {session_id: "...", exp: "..."}
- **AND** system spawns mimo-agent process with --token=<jwt> --platform=ws://localhost:4000/agent
- **AND** system stores agent.yaml with {token: "...", session_id: "...", status: "starting"}
- **AND** system displays "Agent starting..." in chat buffer

#### Scenario: Agent connects successfully
- **WHEN** mimo-agent connects via WebSocket with valid token
- **THEN** system updates agent.yaml status to "connected"
- **AND** system appends "Agent connected" to chat buffer

#### Scenario: Agent fails to start
- **WHEN** mimo-agent executable not found or crashes
- **THEN** system updates agent.yaml status to "failed"
- **AND** system displays error message in chat buffer
- **AND** system allows retry

### Requirement: User can list active agents
The system SHALL display running agents for the current user.

#### Scenario: List active agents
- **WHEN** user navigates to agents page
- **THEN** system displays all agents with status: session name, status, pid, started_at

#### Scenario: Filter by status
- **WHEN** user filters agents by "connected" status
- **THEN** system displays only agents with status "connected"

### Requirement: System can cancel current ACP request
The system SHALL allow users to cancel the current ACP agent request.

#### Scenario: Cancel current request with C-c C-c
- **WHEN** user presses C-c C-c in session
- **THEN** system sends cancel signal to current ACP request
- **AND** system appends "Request cancelled" to chat buffer
- **AND** agent remains connected and ready for next request

#### Scenario: Cancel when no active request
- **WHEN** user presses C-c C-c with no active ACP request
- **THEN** system displays "No active request to cancel"

### Requirement: System can terminate agent
The system SHALL allow users to kill the entire agent process.

#### Scenario: Kill agent via command
- **WHEN** user executes kill-agent command
- **THEN** system terminates mimo-agent process
- **AND** system kills ACP child process
- **AND** system updates agent.yaml status to "killed"
- **AND** system appends "Agent terminated" to chat buffer

#### Scenario: Agent process dies unexpectedly
- **WHEN** mimo-agent process exits unexpectedly
- **THEN** system detects via WebSocket disconnect
- **AND** system kills any orphaned ACP process
- **AND** system updates agent.yaml status to "died"

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

### Requirement: Agent uses token for authentication
The system SHALL validate JWT tokens from agents.

#### Scenario: Valid token authentication
- **WHEN** agent connects with valid JWT token
- **THEN** system identifies session from token claims
- **AND** system authorizes WebSocket connection

#### Scenario: Invalid token rejection
- **WHEN** agent connects with invalid or expired token
- **THEN** system rejects WebSocket connection
- **AND** system logs authentication failure
