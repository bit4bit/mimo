## ADDED Requirements

### Requirement: Store ACP session ID in session.yaml
The system SHALL persist the ACP session identifier in the session's YAML configuration file.

#### Scenario: New ACP session created
- **WHEN** mimo-agent successfully creates a new ACP session via newSession()
- **AND** agent sends acp_session_created message to platform
- **THEN** platform stores the acpSessionId in session.yaml
- **AND** the field is named acpSessionId
- **AND** the value is the ACP session identifier string

#### Scenario: ACP session ID is optional
- **WHEN** loading a session from session.yaml
- **AND** the acpSessionId field is missing or null
- **THEN** system treats this as no persisted ACP session
- **AND** agent will create a new ACP session on next connection

### Requirement: Send acpSessionId to agent on session_ready
The system SHALL include the persisted ACP session ID in the session_ready message sent to agents.

#### Scenario: Session with existing acpSessionId
- **WHEN** agent connects and system prepares session_ready message
- **AND** session has acpSessionId: "acp-abc123" in session.yaml
- **THEN** session_ready message includes acpSessionId: "acp-abc123"
- **AND** the field is present in the session object within sessions array

#### Scenario: Session without acpSessionId
- **WHEN** agent connects and system prepares session_ready message
- **AND** session has no acpSessionId (null or missing)
- **THEN** session_ready message includes acpSessionId: null
- **AND** agent will create new ACP session

### Requirement: Receive acp_session_created from agent
The system SHALL accept acp_session_created message from agent and update session.yaml.

#### Scenario: Agent reports new session
- **WHEN** agent sends acp_session_created message
- **AND** message contains {sessionId, acpSessionId, wasReset, resetReason?}
- **THEN** platform updates session.yaml with new acpSessionId
- **AND** if wasReset is true, append system message to chat history

#### Scenario: Agent reports session resumption
- **WHEN** agent sends acp_session_created message
- **AND** wasReset is false
- **THEN** platform updates session.yaml with acpSessionId
- **AND** no system message is added to chat history

### Requirement: Append system message on session reset
The system SHALL append a system message to chat.jsonl when ACP session cannot be resumed.

#### Scenario: Session reset with reason
- **WHEN** agent reports acp_session_created with wasReset: true
- **AND** resetReason is "loadSession not supported"
- **THEN** system appends message to chat.jsonl with role: "system"
- **AND** content includes timestamp and resetReason
- **AND** format is "Session reset at YYYY-MM-DD HH:MM:SS (reason)"

#### Scenario: Session reset without specific reason
- **WHEN** agent reports acp_session_created with wasReset: true
- **AND** no resetReason is provided
- **THEN** system appends message to chat.jsonl with role: "system"
- **AND** content includes timestamp
- **AND** format is "Session reset at YYYY-MM-DD HH:MM:SS"
