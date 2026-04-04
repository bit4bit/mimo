## ADDED Requirements

### Requirement: Session model selector displays available models
The system SHALL display a dropdown selector in the session header showing available LLM models provided by the ACP server.

#### Scenario: Session created with model options
- **WHEN** a new session is initialized
- **AND** the ACP server returns configOptions with category "model"
- **THEN** the system displays a model selector dropdown
- **AND** the dropdown contains all available models from the config option
- **AND** the currently selected model matches the config option's currentValue

#### Scenario: Session created without model options
- **WHEN** a new session is initialized
- **AND** the ACP server does not return a configOption with category "model"
- **THEN** the system does not display the model selector

### Requirement: User can change session model
The system SHALL allow users to change the active LLM model via the model selector dropdown.

#### Scenario: User selects different model
- **WHEN** user selects a different model from the dropdown
- **THEN** the system sends the change request to the ACP server via setSessionConfigOption
- **AND** the system updates the displayed selection to the new model
- **AND** the system maintains the same session context

#### Scenario: Model change during active turn
- **WHEN** user selects a different model while the agent is processing
- **THEN** the system still sends the change request to ACP
- **AND** the system shows visual feedback that the change is being applied

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

### Requirement: Model and mode state is in-memory only
The system SHALL store model and mode state in runtime memory without persisting to the database.

#### Scenario: Page refresh
- **WHEN** the user refreshes the page
- **THEN** the model and mode selectors reset to their default state
- **AND** the system re-fetches configOptions from the ACP server

#### Scenario: Session reconnect
- **WHEN** a session reconnects after disconnect
- **THEN** the system re-establishes the current model and mode state from ACP

### Requirement: Model/mode options default to first available
The system SHALL default model and mode selection to the first available option when no currentValue is specified.

#### Scenario: New session with no current model
- **WHEN** a new session is created
- **AND** the config option does not specify a currentValue
- **THEN** the system selects the first option in the available options list

### Requirement: Config options mapped by category
The system SHALL identify model and mode config options by their category field, not by hardcoded IDs.

#### Scenario: ACP server uses custom option IDs
- **WHEN** the ACP server returns configOptions
- **AND** a config option has category "model" but id "llm-provider"
- **THEN** the system correctly identifies it as the model selector
- **AND** displays it in the model dropdown

### Requirement: Model/mode change propagated via WebSocket
The system SHALL propagate model and mode state changes between mimo-platform and mimo-agent via WebSocket messages.

#### Scenario: Agent initializes session
- **WHEN** mimo-agent creates an ACP session
- **AND** receives configOptions
- **THEN** mimo-agent sends a WebSocket message with type "session_initialized"
- **AND** the message includes extracted modelState and modeState

#### Scenario: User changes model
- **WHEN** user changes the model selection in the UI
- **THEN** mimo-platform sends a WebSocket message with type "set_model" to mimo-agent
- **AND** mimo-agent forwards the change to ACP via setSessionConfigOption

#### Scenario: Model state broadcast
- **WHEN** model state changes
- **THEN** mimo-platform broadcasts the new state to all connected UI clients
- **AND** the message type is "model_state"
