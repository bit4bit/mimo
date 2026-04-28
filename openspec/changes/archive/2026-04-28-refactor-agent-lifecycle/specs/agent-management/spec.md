## ADDED Requirements

### Requirement: User can create an agent
The system SHALL allow users to create agents independently of sessions. Creating an agent generates a JWT token that the user copies and uses to run mimo-agent locally.

#### Scenario: Create agent successfully
- **WHEN** authenticated user creates a new agent
- **THEN** system generates JWT token with claims {agentId, owner, exp: 24h}
- **AND** system stores agent.yaml with {id, owner, token, status: "offline", startedAt}
- **AND** system displays agent creation confirmation with visible token
- **AND** system shows "Copy Token" button for easy copying

#### Scenario: Token always visible
- **WHEN** user views agent detail page
- **THEN** system displays full token in plaintext
- **AND** system provides "Copy Token" functionality
- **AND** system does not allow token regeneration or revocation

#### Scenario: List agents for user
- **WHEN** user navigates to agents page
- **THEN** system displays all agents owned by user
- **AND** system shows for each agent: name/id, status (online/offline), created timestamp
- **AND** status shows 🟢 for "online", 🔴 for "offline"

#### Scenario: Delete agent
- **WHEN** user deletes an agent
- **THEN** system removes agent.yaml
- **AND** system deletes agent directory
- **AND** any WebSocket connection for that agent is terminated
- **AND** sessions referencing this agent have assignedAgentId cleared

### Requirement: Agent tokens authenticate WebSocket connections
The system SHALL validate JWT tokens when agents connect via WebSocket.

#### Scenario: Agent connects with valid token
- **WHEN** mimo-agent connects via WebSocket with valid JWT token
- **THEN** system verifies token signature and expiration
- **AND** system identifies agent from token claims
- **AND** system stores WebSocket connection in activeConnections map
- **AND** system updates agent status to "online"
- **AND** system updates lastActivityAt timestamp

#### Scenario: Agent connects with invalid token
- **WHEN** agent connects with invalid or expired token
- **THEN** system rejects WebSocket connection with 1008 policy violation
- **AND** system does not create agent record
- **AND** system logs authentication failure

#### Scenario: Agent disconnects
- **WHEN** agent WebSocket connection closes
- **THEN** system removes connection from activeConnections map
- **AND** system updates agent status to "offline"

### Requirement: Agent detail view shows token and sessions
The system SHALL display comprehensive agent information including token and assigned sessions.

#### Scenario: View agent details
- **WHEN** user clicks on agent from agents list
- **THEN** system displays agent detail modal/page
- **AND** system shows agent ID, status, created timestamp, last activity timestamp
- **AND** system shows full token with copy button
- **AND** system lists all sessions currently using this agent (via assignedAgentId)

#### Scenario: Click agent status badge from session
- **WHEN** user clicks agent status badge in session detail page
- **THEN** system opens agent detail modal showing token and connection status
- **AND** user can copy token from the modal