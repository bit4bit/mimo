## MODIFIED Requirements

### Requirement: Agent connects successfully
The system SHALL allow agent to establish WebSocket connection and receive session information. The agent SHALL accept a `--provider` flag at startup to select the ACP provider (`opencode` or `claude`), defaulting to `opencode`.

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
- **AND** agent spawns 3 ACP processes using the selected provider

#### Scenario: Agent handles session_ready
- **WHEN** agent receives session_ready message
- **THEN** agent parses each session in sessions array
- **AND** agent computes absolute checkout path from relative path and workdir
- **AND** agent clones from fossilUrl to checkoutPath for each session
- **AND** agent spawns ACP process in each checkoutPath using the selected provider
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
- **AND** agent spawns new ACP processes using the selected provider

#### Scenario: Agent starts with --provider opencode (default)
- **WHEN** mimo-agent is started without a `--provider` flag
- **THEN** agent uses `OpencodeProvider` (unchanged behavior)

#### Scenario: Agent starts with --provider claude
- **WHEN** mimo-agent is started with `--provider claude`
- **THEN** agent uses `ClaudeAgentProvider` for all sessions

#### Scenario: Agent starts with unknown provider
- **WHEN** mimo-agent is started with an unrecognized `--provider` value
- **THEN** agent logs an error and exits with a non-zero code
