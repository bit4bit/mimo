## ADDED Requirements

### Requirement: Claude provider spawns claude-agent-acp
The system SHALL spawn the `claude-agent-acp` binary as an ACP subprocess when the Claude provider is selected, communicating via stdin/stdout using the ACP protocol.

#### Scenario: Claude provider spawns successfully
- **WHEN** mimo-agent starts with `--provider claude`
- **AND** `claude-agent-acp` is available on PATH
- **THEN** agent spawns `claude-agent-acp` as a subprocess for each session
- **AND** agent communicates with it over ACP (stdin/stdout)
- **AND** session initializes with configOptions containing model and mode selections

#### Scenario: claude-agent-acp binary not found
- **WHEN** mimo-agent starts with `--provider claude`
- **AND** `claude-agent-acp` is not available on PATH
- **THEN** agent logs a clear error indicating the binary is missing
- **AND** agent fails to initialize the session

### Requirement: Claude provider supports model selection
The system SHALL read model options from the ACP `configOptions` response and allow the platform to set the active model via `setSessionConfigOption`.

#### Scenario: Model list is surfaced from session init
- **WHEN** a new ACP session is initialized with the Claude provider
- **THEN** agent extracts available models from `configOptions` where `category === "model"`
- **AND** agent sends model state to the platform

#### Scenario: Platform sets a model
- **WHEN** platform sends a `set_model` message with a valid modelId
- **THEN** agent calls `setSessionConfigOption` on the ACP connection with the model configId
- **AND** the active model changes for that session

### Requirement: Claude provider supports mode selection
The system SHALL read mode options from the ACP `configOptions` response and allow the platform to set the active mode via `setSessionConfigOption`.

#### Scenario: Mode list is surfaced from session init
- **WHEN** a new ACP session is initialized with the Claude provider
- **THEN** agent extracts available modes from `configOptions` where `category === "mode"`
- **AND** agent sends mode state to the platform

#### Scenario: Platform sets a mode
- **WHEN** platform sends a `set_mode` message with a valid modeId
- **THEN** agent calls `setSessionConfigOption` on the ACP connection with the mode configId
- **AND** the active mode changes for that session

### Requirement: Claude provider streams thought and message chunks
The system SHALL map ACP update types from `claude-agent-acp` to mimo message types and forward them to the platform.

#### Scenario: Thought chunk forwarded
- **WHEN** `claude-agent-acp` emits an `agent_thought_chunk` update
- **THEN** agent forwards it as a `thought_chunk` message to the platform

#### Scenario: Message chunk forwarded
- **WHEN** `claude-agent-acp` emits an `agent_message_chunk` update
- **THEN** agent forwards it as a `message_chunk` message to the platform

#### Scenario: Unknown update types are silently skipped
- **WHEN** `claude-agent-acp` emits an update type not mapped by the provider (e.g. `tool_call_update`)
- **THEN** agent silently ignores it without error
