## ADDED Requirements

### Requirement: User can clear session context
The system SHALL allow users to clear the ACP agent's context while preserving the chat history and mimo session state.

#### Scenario: User clicks clear button
- **WHEN** user clicks the "Clear" button in the chat interface
- **THEN** the system sends a `clear_session` message to the agent
- **AND** the agent closes the existing ACP session
- **AND** the agent creates a new ACP session
- **AND** the platform persists the new `acpSessionId` to `session.yaml`
- **AND** the system appends a system message "Session cleared - context reset" to `chat.jsonl`
- **AND** the system displays the system message in the chat UI

### Requirement: Agent handles clear session request
The system SHALL support clearing an ACP session by creating a new session, effectively resetting the agent's context.

#### Scenario: Agent receives clear_session message
- **WHEN** the agent receives a `clear_session` message
- **THEN** the agent SHALL create a new ACP session using `newSession`
- **AND** the agent SHALL use the new session for all subsequent prompts
- **AND** send an `acp_session_cleared` message to the platform with the new `acpSessionId`

#### Scenario: Agent fails to create new session
- **WHEN** the agent receives a `clear_session` message but fails to create a new session
- **THEN** the agent sends an error response with the failure reason
- **AND** the UI displays an error message to the user

### Requirement: Platform persists new acpSessionId
The system SHALL update the persisted session data when an ACP session is cleared.

#### Scenario: Platform receives acp_session_cleared
- **WHEN** the platform receives an `acp_session_cleared` message
- **THEN** the platform updates the `acpSessionId` field in `session.yaml`
- **AND** the platform broadcasts a `session_cleared` message to all connected UI clients

### Requirement: System message indicates clear operation
The system SHALL add a visible marker in the chat history when the session is cleared.

#### Scenario: Clear operation completes successfully
- **WHEN** a clear session operation completes successfully
- **THEN** the system appends a system message with content "Session cleared - context reset" to `chat.jsonl`
- **AND** the system displays this message in the chat UI with appropriate styling to distinguish it from user and assistant messages

### Requirement: Clear button is accessible in chat interface
The system SHALL provide a clear session control in the chat UI.

#### Scenario: Clear button visible
- **WHEN** the user is viewing an active session with an assigned agent
- **THEN** the chat interface displays a "Clear" button alongside other session controls

#### Scenario: Clear button placement
- **WHEN** the session detail page loads
- **THEN** the "Clear" button is positioned near the "Cancel" button in the action bar below the chat buffer
