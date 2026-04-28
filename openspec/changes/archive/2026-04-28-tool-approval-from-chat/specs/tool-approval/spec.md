## ADDED Requirements

### Requirement: Agent requests user approval before executing a tool
The system SHALL pause tool execution and request user approval via the chat UI before allowing any tool call to proceed. This applies to all ACP providers.

#### Scenario: Tool approval request appears in chat
- **WHEN** the agent is about to execute a tool
- **THEN** an approval card SHALL appear in the chat message stream
- **AND** the card SHALL display the tool title, kind, and file locations (if any)
- **AND** the card SHALL display all permission options returned by the ACP SDK

#### Scenario: User approves a tool
- **WHEN** the user clicks an approval option (e.g., "Allow Once")
- **THEN** the system SHALL send the selected option back to the agent
- **AND** the agent SHALL resume tool execution
- **AND** the approval card SHALL be removed from all connected chat tabs

#### Scenario: User rejects a tool
- **WHEN** the user clicks a rejection option (e.g., "Deny")
- **THEN** the system SHALL send the rejection back to the agent
- **AND** the agent SHALL NOT execute the tool
- **AND** the approval card SHALL be removed from all connected chat tabs

#### Scenario: Multiple browser tabs show the same approval card
- **WHEN** a session is open in multiple browser tabs
- **AND** an approval request arrives
- **THEN** all tabs SHALL display the approval card
- **AND** when one tab submits a response, all other tabs SHALL dismiss the card

### Requirement: Pending tool approval is cancelled when all chat clients disconnect
The system SHALL automatically reject any pending tool approval request when the last chat client for that session disconnects.

#### Scenario: Last chat client disconnects with pending approval
- **WHEN** there is one or more pending tool approval requests for a session
- **AND** the last chat WebSocket client for that session closes
- **THEN** the system SHALL send a cancelled outcome for each pending request to the agent
- **AND** the agent SHALL treat each cancelled request as a rejection
