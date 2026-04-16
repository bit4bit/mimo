## ADDED Requirements

### Requirement: Persist tool-call decision summaries with assistant messages
The system SHALL persist tool-call decision summaries (approved, rejected, cancelled) in assistant message metadata when a response turn completes.

#### Scenario: Approved tool calls are stored on completed assistant response
- **WHEN** one or more tool approval requests are selected with an allow option during a response turn
- **AND** that turn reaches assistant message finalization
- **THEN** the persisted assistant message SHALL include `metadata.toolCalls`
- **AND** each approved entry SHALL include tool title, kind, tool call identifier when available, and decision status `approved`

#### Scenario: Rejected tool calls are stored with rejected status
- **WHEN** a tool approval request is rejected or cancelled
- **AND** the response turn reaches assistant message finalization
- **THEN** that request SHALL be included in `metadata.toolCalls`
- **AND** each entry SHALL include decision status `rejected` or `cancelled`

### Requirement: Show tool-call information in the session chat assistant box
The session page SHALL display tool-call summaries inside assistant message cards after the response completes.

#### Scenario: Live message shows tools used block
- **WHEN** an assistant response with `metadata.toolCalls` is rendered in chat
- **THEN** the assistant message card SHALL include a tool summary section in the same message box
- **AND** each tool item SHALL show tool title in collapsed state by default

#### Scenario: User unfolds a tool item to inspect details
- **WHEN** the user clicks a collapsed tool item in the assistant message box
- **THEN** the tool item SHALL expand
- **AND** the expanded content SHALL include decision status
- **AND** the expanded content SHALL include tool kind
- **AND** the expanded content SHALL include selected option kind when available
- **AND** the expanded content SHALL include file locations when available

#### Scenario: History replay preserves tool-call display
- **WHEN** the user reloads the session page and chat history is replayed
- **THEN** assistant messages with `metadata.toolCalls` SHALL render the same tool summary section
