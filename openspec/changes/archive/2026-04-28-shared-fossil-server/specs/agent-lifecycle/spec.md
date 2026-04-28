## MODIFIED Requirements

### Requirement: Agent connects successfully
The system SHALL allow agent to establish WebSocket connection and receive session information.

#### Scenario: Agent connects with valid token
- **WHEN** mimo-agent connects via WebSocket with valid token
- **AND** agent sends agent_ready message with {agentId, workdir}
- **THEN** system updates agent.yaml status to "online"
- **AND** system looks up all sessions assigned to agent
- **AND** system sends session_ready message with {platformUrl, sessions: [{sessionId, fossilUrl, checkoutPath}]}
- **AND** fossilUrl uses format `http://<host>:<port>/<session-id>.fossil/`
- **AND** system logs "Agent connected" to console

#### Scenario: Agent connects with multiple sessions
- **WHEN** agent connects with 3 assigned sessions
- **THEN** system sends session_ready with all 3 sessions
- **AND** each session has fossilUrl pointing to shared server with unique path
- **AND** agent clones all 3 checkouts using their respective fossilUrls
- **AND** agent spawns 3 ACP processes

#### Scenario: Agent handles session_ready with shared server URLs
- **WHEN** agent receives session_ready message
- **THEN** agent parses each session in sessions array
- **AND** agent extracts sessionId from fossilUrl path
- **AND** agent computes absolute checkout path from relative path and workdir
- **AND** agent clones from fossilUrl to checkoutPath for each session
- **AND** agent spawns ACP process in each checkoutPath
- **AND** agent sends agent_sessions_ready to platform with {sessionIds: [...]}

#### Scenario: Agent connects with no sessions
- **WHEN** agent connects with valid token
- **AND** agent has no sessions assigned
- **THEN** system sends session_ready with empty sessions array
- **AND** agent remains connected waiting for session assignment

#### Scenario: Agent reconnects after disconnect
- **WHEN** agent disconnects unexpectedly
- **AND** agent reconnects within 30 seconds
- **THEN** system sends session_ready with same sessions
- **AND** fossilUrl format remains consistent with shared server
- **AND** agent opens existing checkouts (does not re-clone)
- **AND** agent spawns new ACP processes

### Requirement: Agent disconnects gracefully
The system SHALL handle agent disconnections and maintain shared Fossil server availability.

#### Scenario: Agent disconnects with cleanup
- **WHEN** agent disconnects
- **THEN** system updates agent.yaml status to "offline"
- **AND** system does NOT stop the shared Fossil server (other agents may be using it)
- **AND** system waits 30 seconds in case of reconnection
- **AND** if no reconnection, system marks sessions as available for reassignment

## ADDED Requirements

### Requirement: Agent constructs fossilUrl from sessionId
The system SHALL provide sessionId to agent for URL construction.

#### Scenario: Agent derives repository URL from sessionId
- **WHEN** agent receives session data from platform
- **THEN** agent constructs fossilUrl as `http://<platformHost>:<port>/<session-id>.fossil/`
- **AND** agent uses this URL for fossil sync operations
- **AND** agent includes credentials in URL for authentication

### Requirement: Agent handles shared server availability
The system SHALL ensure agent can sync when shared server is temporarily unavailable.

#### Scenario: Agent retries sync on server error
- **WHEN** agent attempts fossil sync against shared server
- **AND** server returns 503 or connection refused
- **THEN** agent retries sync after 2 second delay
- **AND** agent retries up to 5 times before failing
- **AND** agent logs retry attempts for debugging
