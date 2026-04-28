## MODIFIED Requirements

### Requirement: Agent connects successfully
The system SHALL allow agent to establish WebSocket connection and receive session information including local development mirror path.

#### Scenario: Agent connects with valid token
- **WHEN** mimo-agent connects via WebSocket with valid token
- **AND** agent sends agent_ready message with {agentId, workdir}
- **THEN** system updates agent.yaml status to "online"
- **AND** system looks up all sessions assigned to agent
- **AND** system starts fossil server for each active session
- **AND** system sends session_ready message with {platformUrl, sessions: [{sessionId, port, checkoutPath, localDevMirrorPath}]}
- **AND** system logs "Agent connected" to console

#### Scenario: session_ready includes mirror path for session
- **WHEN** system sends session_ready to agent
- **AND** session has localDevMirrorPath "/home/user/dev"
- **THEN** session object includes localDevMirrorPath field
- **AND** agent stores mirror path in session context

#### Scenario: session_ready with null mirror path
- **WHEN** system sends session_ready to agent
- **AND** session has no localDevMirrorPath configured
- **THEN** session object includes localDevMirrorPath as null
- **AND** agent skips mirror sync for this session

#### Scenario: Agent handles session_ready with mirror path
- **WHEN** agent receives session_ready message
- **THEN** agent parses each session in sessions array
- **AND** agent extracts localDevMirrorPath for each session
- **AND** agent stores path in session context for file sync
- **AND** agent proceeds with checkout setup and ACP spawn
