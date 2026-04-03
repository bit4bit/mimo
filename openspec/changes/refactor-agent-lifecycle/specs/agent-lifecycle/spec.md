## REMOVED Requirements

### Requirement: User can create an agent
**Reason**: Agent creation is now decoupled from sessions. Moved to agent-management capability with user-controlled token generation.

### Requirement: System can terminate agent
**Reason**: Platform no longer spawns agent processes. User controls agent lifecycle locally with mimo-agent command.

### Requirement: Agent persists across disconnects
**Reason**: Agent process management is now user's responsibility. Platform only tracks connection state.

## MODIFIED Requirements

### Requirement: User can list active agents
The system SHALL display agents for the current user with their online/offline status.

#### Scenario: List agents with online status
- **WHEN** user navigates to agents page
- **THEN** system displays all agents owned by user
- **AND** system shows for each agent: ID, status (online/offline), created timestamp, last activity timestamp
- **AND** status is derived from WebSocket connection state (online = has active connection, offline = no connection)

#### Scenario: Filter agents by status
- **WHEN** user filters agents by "online" status
- **THEN** system displays only agents with active WebSocket connections
- **AND** system displays only agents with status "online"

### Requirement: System can cancel current ACP request
The system SHALL allow users to cancel the current ACP agent request through the platform WebSocket.

#### Scenario: Cancel current request
- **WHEN** user sends cancel request through platform UI
- **THEN** system sends cancel message to agent via WebSocket
- **AND** system appends "Request cancelled" to chat buffer

#### Scenario: Cancel when agent offline
- **WHEN** user attempts to cancel request and agent is offline
- **THEN** system displays "Agent is offline, cannot cancel request"

### Requirement: Agent uses token for authentication
The system SHALL validate JWT tokens from agents on WebSocket connection.

#### Scenario: Valid token authentication
- **WHEN** agent connects via WebSocket with valid JWT token
- **THEN** system verifies token signature and claims
- **AND** system extracts agentId and owner from token
- **AND** system authorizes WebSocket connection
- **AND** system stores connection in activeConnections map

#### Scenario: Invalid token rejection
- **WHEN** agent connects with invalid or expired token
- **THEN** system rejects WebSocket connection with 1008 policy violation
- **AND** system logs authentication failure with reason