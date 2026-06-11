## ADDED Requirements

### Requirement: Brain-wash toggle auto-approves all tool permissions for a thread

The system SHALL provide a per-thread "brain-wash" setting that, when enabled, automatically approves all tool permission requests for that thread without requiring user interaction.

#### Scenario: Brain-wash enabled auto-approves a tool call

- **WHEN** a chat thread has brain-wash enabled
- **AND** the agent requests permission for a tool call
- **THEN** the system SHALL automatically resolve the request with the "Always Allow" option if available, or "Allow Once" otherwise
- **AND** the permission card SHALL NOT appear in the browser UI
- **AND** an inline auto-approval indicator SHALL appear in the chat message stream

#### Scenario: Brain-wash disabled shows normal permission card

- **WHEN** a chat thread has brain-wash disabled
- **THEN** the system SHALL route permission requests through the normal browser round-trip
- **AND** a permission card SHALL appear in the chat message stream

#### Scenario: Brain-wash toggle persists across restarts

- **WHEN** a user enables brain-wash for a thread
- **AND** the session is later restarted or the agent reconnects
- **THEN** the brain-wash setting SHALL remain enabled for that thread

#### Scenario: Brain-wash is per-thread

- **WHEN** a session has two threads, "Main" with brain-wash enabled and "Reviewer" with brain-wash disabled
- **THEN** tool calls in "Main" SHALL be auto-approved
- **AND** tool calls in "Reviewer" SHALL show normal permission cards

#### Scenario: Brain-wash survives thread park/wake cycle

- **WHEN** a thread with brain-wash enabled is parked and later woken
- **AND** the agent requests permission for a tool call
- **THEN** the request SHALL still be auto-approved

### Requirement: Brain-wash toggle is available in the thread header UI

The system SHALL render a "Brain-wash" checkbox in the thread header area alongside the model and mode selectors.

#### Scenario: Checkbox reflects current brain-wash state

- **WHEN** a user selects a thread
- **AND** brain-wash is enabled for that thread
- **THEN** the checkbox SHALL be checked

#### Scenario: Toggle updates brain-wash state

- **WHEN** a user clicks the brain-wash checkbox
- **THEN** the brain-wash state SHALL be persisted via the existing chat thread update API
- **AND** the checkbox SHALL reflect the new state immediately
