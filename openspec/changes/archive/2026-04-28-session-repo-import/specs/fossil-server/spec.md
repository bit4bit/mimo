## ADDED Requirements

### Requirement: Platform starts Fossil HTTP server when agent connects

The platform SHALL start a Fossil HTTP server for each session assigned to the connecting agent. 

#### Scenario: Agent connects with assigned sessions
- **WHEN** agent sends WebSocket message `agent_ready` with valid token
- **THEN** platform starts Fossil HTTP server for each assigned session
- **AND** platform assigns an available port from range 8000-9000
- **AND** platform stores the port in session.yaml
- **AND** platform sends `session_ready` message to agent with `{sessionId, port}`

#### Scenario: No assigned sessions
- **WHEN** agent connects with no assigned sessions
- **THEN** platform sends empty `session_ready` array
- **AND** no Fossil servers are started

### Requirement: Platform assigns unique ports for Fossil servers

The platform SHALL assign ports from range 8000-9000 with collision detection.

#### Scenario: Port assignment with available ports
- **WHEN** platform needs to start Fossil server
- **THEN** platform finds first available port in range 8000-9000
- **AND** platform marks port as in-use
- **AND** platform starts Fossil server on assigned port

#### Scenario: Port exhaustion
- **WHEN** all ports 8000-9000 are in use
- **THEN** platform returns error `PORTS_EXHAUSTED`
- **AND** session is marked as `error` state

### Requirement: Platform stops Fossil server when agent disconnects

The platform SHALL stop Fossil HTTP servers for all sessions assigned to the disconnecting agent.

#### Scenario: Agent disconnects gracefully
- **WHEN** agent WebSocket closes normally
- **THEN** platform stops Fossil servers for all assigned sessions
- **AND** platform releases assigned ports
- **AND** platform marks sessions as `paused`

#### Scenario: Agent connection lost
- **WHEN** agent WebSocket closes unexpectedly or times out
- **THEN** platform stops Fossil servers after 30-second grace period
- **AND** platform releases assigned ports
- **AND** platform marks sessions as `paused`

### Requirement: Fossil server serves repository for agent clone

The Fossil server SHALL serve the session's `repo.fossil` for agent cloning.

#### Scenario: Agent clones from Fossil server
- **WHEN** agent sends `fossil clone http://platform:port` request
- **THEN** Fossil server responds with repository data
- **AND** agent receives complete repository clone