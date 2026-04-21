## ADDED Requirements

### Requirement: Display available ACP commands in session chat
The session chat UI SHALL display ACP-provided available commands for the active session/thread.

#### Scenario: Commands are shown from update payload
- **WHEN** the UI receives an `available_commands_update` event for the active session/thread
- **THEN** the UI SHALL store and render the available command list
- **AND** each visible command item SHALL show command name
- **AND** the UI SHOULD show command description when provided

#### Scenario: Empty commands payload
- **WHEN** the command update payload is empty or missing commands
- **THEN** the UI SHALL render an empty state without errors

### Requirement: Provide command picker entry points
The session chat UI SHALL provide both button-based and slash-triggered command discovery.

#### Scenario: Open picker via commands button
- **WHEN** the user clicks the `Commands` button near chat input
- **THEN** the command picker SHALL open and list available commands for the current session/thread

#### Scenario: Open filtered picker via slash trigger
- **WHEN** the user types `/` in the chat input
- **THEN** the command picker SHALL open in filtered mode
- **AND** the list SHALL update as the user continues typing

### Requirement: Insert command template into chat input
The session chat UI SHALL insert selected command text/template into the chat input without auto-submitting.

#### Scenario: Select command from picker
- **WHEN** the user selects a command item from the picker
- **THEN** the UI SHALL insert command text or template into chat input at cursor position
- **AND** the UI SHALL keep the message unsent until explicit user send action
