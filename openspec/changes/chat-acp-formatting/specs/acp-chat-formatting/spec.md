## ADDED Requirements

### Requirement: Parse ACP sessionUpdate notifications
The system SHALL parse ACP `sessionUpdate` notifications from opencode agent and extract the update type and content.

#### Scenario: Parse agent_thought_chunk
- **WHEN** the agent receives an ACP `sessionUpdate` with `sessionUpdate: "agent_thought_chunk"`
- **THEN** the system SHALL emit a `thought_chunk` event with the text content

#### Scenario: Parse agent_message_chunk
- **WHEN** the agent receives an ACP `sessionUpdate` with `sessionUpdate: "agent_message_chunk"`
- **THEN** the system SHALL emit a `message_chunk` event with the text content

#### Scenario: Parse usage_update
- **WHEN** the agent receives an ACP `sessionUpdate` with `sessionUpdate: "usage_update"`
- **THEN** the system SHALL emit a `usage_update` event with the cost information

### Requirement: Filter out available_commands_update
The system SHALL NOT forward `available_commands_update` events to the chat UI.

#### Scenario: Commands update is filtered
- **WHEN** the agent receives an ACP `sessionUpdate` with `sessionUpdate: "available_commands_update"`
- **THEN** the system SHALL NOT emit any event to the chat

### Requirement: Group thought chunks
The system SHALL buffer thought chunks and emit start/end events to create a grouped thought section.

#### Scenario: Thought sequence
- **WHEN** the agent receives the first `agent_thought_chunk` for a response
- **THEN** the system SHALL emit `thought_start` before the first `thought_chunk`
- **AND** the system SHALL emit `thought_end` after the last thought chunk before message chunks begin

### Requirement: Display thoughts in collapsible section
The chat UI SHALL display agent thoughts in a collapsible section with a toggle button.

#### Scenario: Collapsed thoughts
- **WHEN** the UI receives `thought_start` event
- **THEN** the system SHALL display a collapsed thought header labeled "Thinking..."
- **AND** the thought content SHALL be hidden by default

#### Scenario: Expand thoughts
- **WHEN** the user clicks the thought header
- **THEN** the system SHALL expand the thought section
- **AND** display all thought content received via `thought_chunk` events

### Requirement: Stream message content
The chat UI SHALL stream message content as it arrives via `message_chunk` events.

#### Scenario: Message streaming
- **WHEN** the UI receives `message_chunk` events
- **THEN** the system SHALL append the text to the current assistant message
- **AND** scroll the chat to show the new content

### Requirement: Display usage information
The chat UI SHALL display usage/cost information under the Send button.

#### Scenario: Show cost
- **WHEN** the UI receives `usage_update` with cost information
- **THEN** the system SHALL display the cost formatted as "Cost: $X.XXXX"
- **AND** place it below the Send button in the chat input area

### Requirement: Parse JSON content from agent
The system SHALL parse JSON content from agent responses instead of displaying raw JSON.

#### Scenario: Formatted display
- **WHEN** the agent sends a response containing JSON data
- **THEN** the system SHALL parse and extract the meaningful text content
- **AND** display only the extracted text, not the raw JSON structure
