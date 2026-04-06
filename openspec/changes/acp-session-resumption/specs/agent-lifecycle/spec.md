## MODIFIED Requirements

### Requirement: Agent connects successfully
The system SHALL allow agent to establish WebSocket connection and receive session information including ACP session ID.

#### Scenario: Agent connects with valid token
- **WHEN** mimo-agent connects via WebSocket with valid token
- **AND** agent sends agent_ready message with {agentId, workdir}
- **THEN** system updates agent.yaml status to "online"
- **AND** system looks up all sessions assigned to agent
- **AND** system reads acpSessionId from each session's session.yaml
- **AND** system starts fossil server for each active session
- **AND** system sends session_ready message with {platformUrl, sessions: [{sessionId, port, checkoutPath, acpSessionId}]}
- **AND** system logs "Agent connected" to console

#### Scenario: Agent connects with multiple sessions
- **WHEN** agent connects with 3 assigned sessions
- **THEN** system starts 3 fossil servers on ports 8080, 8081, 8082
- **AND** system sends session_ready with all 3 sessions including acpSessionId for each
- **AND** agent clones all 3 checkouts
- **AND** agent spawns 3 ACP processes

#### Scenario: Agent handles session_ready
- **WHEN** agent receives session_ready message
- **THEN** agent parses each session in sessions array
- **AND** agent extracts acpSessionId from each session object
- **AND** agent computes absolute checkout path from relative path and workdir
- **AND** agent clones from fossilUrl to checkoutPath for each session
- **AND** agent spawns ACP process in each checkoutPath passing acpSessionId
- **AND** agent sends agent_sessions_ready to platform with {sessionIds: [...]}

## ADDED Requirements

### Requirement: Agent reports ACP session creation
The system SHALL receive acp_session_created message from agent after ACP session initialization.

#### Scenario: Agent creates new ACP session
- **WHEN** agent initializes ACP for a session
- **AND** agent either calls newSession() or loadSession()
- **THEN** agent sends acp_session_created to platform
- **AND** message contains {type: "acp_session_created", sessionId, acpSessionId, wasReset}
- **AND** wasReset is true if newSession() was used when loadSession was possible

#### Scenario: Agent reports session resumption
- **WHEN** agent successfully calls loadSession() with existing acpSessionId
- **THEN** agent sends acp_session_created with wasReset: false
- **AND** chat history continues seamlessly without reset notification

### Requirement: Agent handles ACP capability detection
The system SHALL detect ACP agent capabilities and choose appropriate session initialization method.

#### Scenario: ACP supports loadSession
- **WHEN** agent initializes ACP connection
- **AND** ACP initialize response has agentCapabilities.loadSession: true
- **AND** session_ready provided acpSessionId: "acp-abc123"
- **THEN** agent calls connection.loadSession({sessionId: "acp-abc123", cwd, mcpServers})
- **AND** if successful, wasReset is false
- **AND** if fails, agent falls back to newSession() with wasReset: true

#### Scenario: ACP does not support loadSession
- **WHEN** agent initializes ACP connection
- **AND** ACP initialize response has agentCapabilities.loadSession: false or undefined
- **AND** session_ready provided acpSessionId: "acp-abc123"
- **THEN** agent calls connection.newSession({cwd, mcpServers})
- **AND** agent sends acp_session_created with wasReset: true
- **AND** resetReason is "loadSession not supported"

#### Scenario: No persisted session ID
- **WHEN** agent initializes ACP connection
- **AND** session_ready provided acpSessionId: null
- **THEN** agent calls connection.newSession({cwd, mcpServers})
- **AND** agent sends acp_session_created with wasReset: false
- **AND** this is treated as initial session creation, not a reset
