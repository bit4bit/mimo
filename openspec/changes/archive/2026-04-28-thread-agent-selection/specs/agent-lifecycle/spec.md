## MODIFIED Requirements

### Requirement: Agent connects successfully
The system SHALL allow agent to establish WebSocket connection, receive session information, and advertise its capabilities.

#### Scenario: Agent connects with valid token
- **WHEN** mimo-agent connects via WebSocket with valid token
- **AND** agent sends `agent_ready` message with `{ agentId, workdir }`
- **THEN** system updates agent.yaml status to "online"
- **AND** system looks up all sessions that have threads assigned to this agent
- **AND** system starts fossil server for each such session
- **AND** system sends `session_ready` message with `{ platformUrl, sessions: [{ sessionId, port, checkoutPath, threads: [{ threadId }] }] }`
- **AND** system logs "Agent connected" to console

#### Scenario: Agent connects with multiple sessions
- **WHEN** agent connects with threads assigned across 3 sessions
- **THEN** system starts 3 fossil servers on ports 8080, 8081, 8082
- **AND** system sends `session_ready` with all 3 sessions
- **AND** agent clones all 3 checkouts
- **AND** agent spawns one ACP process per thread

#### Scenario: Agent handles session_ready
- **WHEN** agent receives `session_ready` message
- **THEN** agent parses each session in sessions array
- **AND** agent computes absolute checkout path from relative path and workdir
- **AND** agent clones from fossilUrl to checkoutPath for each session
- **AND** agent spawns ACP process for each assigned thread in each session
- **AND** agent sends `agent_sessions_ready` to platform with `{ sessionIds: [...] }`

#### Scenario: Agent connects with no assigned threads
- **WHEN** agent connects with valid token
- **AND** no threads are assigned to this agent
- **THEN** system sends `session_ready` with empty sessions array
- **AND** agent remains connected waiting for thread assignment

#### Scenario: Agent reconnects after disconnect
- **WHEN** agent disconnects unexpectedly
- **AND** agent reconnects within 30 seconds
- **THEN** system finds existing fossil servers still running
- **AND** system sends `session_ready` with same sessions and threads
- **AND** agent opens existing checkouts (does not re-clone)
- **AND** agent spawns new ACP processes for each assigned thread

## ADDED Requirements

### Requirement: Agent sends workdir on connect
The system SHALL receive agent's working directory for relative path computation.

#### Scenario: Agent includes workdir in agent_ready
- **WHEN** agent sends `agent_ready` message
- **THEN** message includes workdir field with absolute path
- **AND** system stores workdir in agent context
- **AND** system uses workdir to compute relative checkout paths

### Requirement: Agent sends capabilities immediately after agent_ready
The system SHALL process `agent_capabilities` as part of the agent connect handshake.

#### Scenario: Agent sends capabilities after agent_ready
- **WHEN** agent has sent `agent_ready` and then sends `agent_capabilities`
- **THEN** system stores `{ availableModels, defaultModelId, availableModes, defaultModeId }` on agent.yaml
- **AND** capabilities are immediately available via `GET /agents/:agentId/capabilities`
