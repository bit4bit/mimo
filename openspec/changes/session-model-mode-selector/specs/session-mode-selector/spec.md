## ADDED Requirements

### Requirement: Session mode selector displays available modes
The system SHALL display a dropdown selector in the session header showing available operational modes provided by the ACP server.

#### Scenario: Session created with mode options
- **WHEN** a new session is initialized
- **AND** the ACP server returns configOptions with category "mode"
- **THEN** the system displays a mode selector dropdown
- **AND** the dropdown contains all available modes from the config option
- **AND** the currently selected mode matches the config option's currentValue

#### Scenario: Session created without mode options
- **WHEN** a new session is initialized
- **AND** the ACP server does not return a configOption with category "mode"
- **THEN** the system does not display the mode selector

### Requirement: User can change session mode
The system SHALL allow users to change the operational mode via the mode selector dropdown.

#### Scenario: User selects different mode
- **WHEN** user selects a different mode from the dropdown
- **THEN** the system sends the change request to the ACP server via setSessionConfigOption
- **AND** the system updates the displayed selection to the new mode
- **AND** the system maintains the same session context

#### Scenario: Mode change during active turn
- **WHEN** user selects a different mode while the agent is processing
- **THEN** the system still sends the change request to ACP
- **AND** the system shows visual feedback that the change is being applied

### Requirement: Mode state is in-memory only
The system SHALL store mode state in runtime memory without persisting to the database.

#### Scenario: Page refresh
- **WHEN** the user refreshes the page
- **THEN** the mode selector resets to its default state
- **AND** the system re-fetches configOptions from the ACP server

#### Scenario: Session reconnect
- **WHEN** a session reconnects after disconnect
- **THEN** the system re-establishes the current mode state from ACP

### Requirement: Mode options default to first available
The system SHALL default mode selection to the first available option when no currentValue is specified.

#### Scenario: New session with no current mode
- **WHEN** a new session is created
- **AND** the config option does not specify a currentValue
- **THEN** the system selects the first option in the available options list

### Requirement: Mode change propagated via WebSocket
The system SHALL propagate mode state changes between mimo-platform and mimo-agent via WebSocket messages.

#### Scenario: User changes mode
- **WHEN** user changes the mode selection in the UI
- **THEN** mimo-platform sends a WebSocket message with type "set_mode" to mimo-agent
- **AND** mimo-agent forwards the change to ACP via setSessionConfigOption

#### Scenario: Mode state broadcast
- **WHEN** mode state changes
- **THEN** mimo-platform broadcasts the new state to all connected UI clients
- **AND** the message type is "mode_state"

### Requirement: Mode selector positioned alongside model selector
The system SHALL display the mode selector adjacent to the model selector in the session header.

#### Scenario: Both selectors present
- **WHEN** both model and mode config options are available
- **THEN** both dropdowns are visible in the session header
- **AND** they are positioned side by side
- **AND** each has a clear label identifying its purpose
