## ADDED Requirements

### Requirement: Platform sends complete session information to agent
The system SHALL send complete session bootstrap information when agent connects.

#### Scenario: Agent connects with assigned sessions
- **WHEN** agent connects via WebSocket with valid token
- **AND** agent has 2 sessions assigned
- **THEN** system starts fossil server for each session
- **AND** system sends session_ready message with platformUrl and sessions array
- **AND** each session includes sessionId and port

#### Scenario: Session with no assigned agent
- **WHEN** session is created but has no assigned agent
- **THEN** fossil server does NOT start
- **AND** system stores session with status "active" and port null
- **AND** fossil server starts when agent connects and receives session_ready

#### Scenario: Agent connects with no sessions
- **WHEN** agent connects via WebSocket
- **AND** agent has no sessions assigned
- **THEN** system sends session_ready with empty sessions array
- **AND** agent remains connected waiting for session assignment

### Requirement: Agent bootstrap from fossil proxy
The system SHALL enable agent to clone and setup checkout from fossil proxy server.

#### Scenario: Agent clones from fossil proxy
- **WHEN** agent receives session_ready message
- **AND** session includes sessionId "abc-123"
- **AND** agent workdir is "/home/user/work"
- **THEN** agent derives checkout path as "/home/user/work/abc-123"
- **AND** agent constructs fossil URL from platformUrl and port: "http://localhost:8080"
- **AND** agent clones fossil: fossil clone <fossilUrl> <workdir>/<sessionId>.fossil
- **AND** agent opens checkout: fossil open in <workdir>/<sessionId>

#### Scenario: Clone fails with network error
- **WHEN** agent attempts fossil clone
- **AND** fossil server is unreachable
- **THEN** agent logs error with sessionId and port
- **AND** agent sends session_error message to platform
- **AND** agent continues processing other sessions

#### Scenario: Clone fails with existing checkout
- **WHEN** agent attempts fossil clone
- **AND** checkout directory already exists at {workdir}/{sessionId}
- **THEN** agent opens existing checkout: fossil open
- **AND** agent continues with existing checkout

#### Scenario: Agent reconnects with existing checkout
- **WHEN** agent receives session_ready with sessionId "abc-123"
- **AND** checkout already exists at {workdir}/abc-123
- **THEN** agent skips clone
- **AND** agent runs fossil open in existing checkout
- **AND** agent spawns new ACP process

### Requirement: Agent maintains multi-session state
The system SHALL allow agent to manage multiple concurrent sessions.

#### Scenario: Agent tracks multiple sessions
- **WHEN** agent receives session_ready with 3 sessions
- **THEN** agent creates entry in sessions map for each sessionId
- **AND** each entry stores checkoutPath ({workdir}/{sessionId}), fossilUrl, acpProcess, fileWatcher
- **AND** agent processes sessions sequentially

#### Scenario: Agent routes messages by session
- **WHEN** platform sends user_message with sessionId
- **THEN** agent looks up session in sessions map
- **AND** agent forwards message to correct ACP process
- **AND** agent includes sessionId in acp_response

#### Scenario: Agent loses session context
- **WHEN** agent receives message for unknown sessionId
- **THEN** agent logs warning
- **AND** agent sends error_response to platform

### Requirement: Agent spawns ACP process per session
The system SHALL spawn one ACP process per session after checkout is ready.

#### Scenario: ACP process spawns in checkout directory
- **WHEN** agent successfully clones fossil checkout
- **THEN** agent spawns ACP process in {workdir}/{sessionId} directory
- **AND** agent uses @agentclientprotocol/sdk for communication
- **AND** agent stores process reference in session context

#### Scenario: ACP process fails to start
- **WHEN** agent attempts to spawn ACP process
- **AND** process exits within 5 seconds
- **THEN** agent logs error with sessionId
- **AND** agent sends session_error with reason "acp_failed"
- **AND** agent retains session in map with acpProcess null

#### Scenario: Agent handles session file changes
- **WHEN** file watcher detects change in checkout directory
- **THEN** agent batches changes with 500ms debounce
- **AND** agent includes sessionId in file_changed message
- **AND** agent sends to platform via WebSocket

### Requirement: Agent derives checkout path from sessionId
The system SHALL compute checkout path as {workdir}/{sessionId}.

#### Scenario: Agent uses workdir and sessionId
- **WHEN** agent receives session_ready with sessionId "abc-123"
- **AND** agent was started with --workdir /home/user/work
- **THEN** agent computes checkout path as /home/user/work/abc-123
- **AND** agent creates checkout directory if needed

#### Scenario: Agent started without workdir
- **WHEN** agent is started without --workdir flag
- **THEN** agent uses process.cwd() as workdir
- **AND** agent computes checkout path as {cwd}/{sessionId}