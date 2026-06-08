## MODIFIED Requirements

### Requirement: Agent requests user approval before executing a tool

The system SHALL pause tool execution and request user approval via the chat UI before allowing any tool call to proceed. This applies to all ACP providers. Approval cards SHALL only render in the chat thread that originated the tool request.

#### Scenario: Tool approval request appears in the originating thread

- **WHEN** the agent in chat thread A is about to execute a tool
- **THEN** an approval card SHALL appear only in chat thread A's message stream
- **AND** the card SHALL display the tool title, kind, and file locations (if any)
- **AND** the card SHALL display all permission options returned by the ACP SDK
- **AND** the card SHALL NOT appear in other chat threads within the same session

#### Scenario: User approves a tool

- **WHEN** the user clicks an approval option (e.g., "Allow Once")
- **THEN** the system SHALL send the selected option back to the agent
- **AND** the agent SHALL resume tool execution
- **AND** the approval card SHALL be removed from all connected chat tabs viewing the same thread

#### Scenario: User rejects a tool

- **WHEN** the user clicks a rejection option (e.g., "Deny")
- **THEN** the system SHALL send the rejection back to the agent
- **AND** the agent SHALL NOT execute the tool
- **AND** the approval card SHALL be removed from all connected chat tabs viewing the same thread

#### Scenario: Multiple browser tabs show the same approval card for the same thread

- **WHEN** a session is open in multiple browser tabs
- **AND** all tabs are viewing the same chat thread
- **AND** an approval request arrives for that thread
- **THEN** all tabs viewing that thread SHALL display the approval card
- **AND** when one tab submits a response, all other tabs viewing that thread SHALL dismiss the card

#### Scenario: Approval request arrives for a non-active thread

- **WHEN** the user is viewing chat thread B
- **AND** a `permission_request` arrives for chat thread A
- **THEN** the approval card SHALL NOT render in chat thread B
- **AND** the approval card SHALL be available in chat thread A when the user switches to it

#### Scenario: Permission resolved for non-active thread

- **WHEN** the user is viewing chat thread B
- **AND** a `permission_resolved` event arrives for chat thread A
- **THEN** the resolved card in thread A SHALL be cleaned up without affecting thread B's view