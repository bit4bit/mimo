## MODIFIED Requirements

### Requirement: Agent connects successfully
The system SHALL allow agent to establish WebSocket connection and receive session information.

#### Scenario: Agent connects with valid token
- **WHEN** mimo-agent connects via WebSocket with valid token
- **AND** agent sends agent_ready message with {agentId, workdir}
- **THEN** system updates agent.yaml status to "online"
- **AND** system looks up all sessions assigned to agent
- **AND** system starts fossil server for each active session
- **AND** system sends session_ready message with {platformUrl, sessions: [{sessionId, port, checkoutPath}]}
- **AND** system logs "Agent connected" to console

#### Scenario: Agent connects with multiple sessions
- **WHEN** agent connects with 3 assigned sessions
- **THEN** system starts 3 fossil servers on ports 8080, 8081, 8082
- **AND** system sends session_ready with all 3 sessions
- **AND** agent clones all 3 checkouts
- **AND** agent spawns 3 ACP processes

#### Scenario: Agent handles session_ready
- **WHEN** agent receives session_ready message
- **THEN** agent parses each session in sessions array
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
- **THEN** system finds existing fossil servers still running
- **AND** system sends session_ready with same sessions
- **AND** agent opens existing checkouts (does not re-clone)
- **AND** agent spawns new ACP processes

## ADDED Requirements

### Requirement: Agent sends workdir on connect
The system SHALL receive agent's working directory for relative path computation.

#### Scenario: Agent includes workdir in agent_ready
- **WHEN** agent sends agent_ready message
- **THEN** message includes workdir field with absolute path
- **AND** system stores workdir in agent context
- **AND** system uses workdir to compute relative checkout paths