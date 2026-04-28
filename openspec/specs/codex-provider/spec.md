## ADDED Requirements

### Requirement: Codex provider spawns codex-acp binary
The system SHALL launch the `codex-acp` binary via stdin/stdout pipes when the agent selects the Codex provider.

#### Scenario: Codex provider starts successfully
- **WHEN** mimo-agent starts with `--provider codex`
- **AND** `codex-acp` is available on `PATH`
- **THEN** the agent spawns `codex-acp` with piped stdio inside the session checkout
- **AND** the agent reports `session_initialized` after ACP initialization succeeds

### Requirement: Codex provider extracts model and mode state
The system SHALL populate model and mode state from Codex session responses, preferring `configOptions` and falling back to legacy `models` / `modes` fields.

#### Scenario: Codex returns config options
- **WHEN** Codex `new_session` returns `configOptions` entries for model and mode
- **THEN** the agent records each option ID and builds the available model/mode lists
- **AND** the agent sets the current model and mode based on `currentValue`

#### Scenario: Codex returns legacy fields only
- **WHEN** Codex omits `configOptions`
- **AND** returns legacy `models` or `modes`
- **THEN** the agent derives available entries from `availableModels` / `availableModes`
- **AND** the agent sets the current model/mode to `currentModelId`

### Requirement: Codex provider updates model and mode selections
The system SHALL update Codex sessions via `setSessionConfigOption` when the platform requests a model or mode change.

#### Scenario: Platform sets Codex model
- **WHEN** mimo-platform sends a `set_model` command with a Codex model ID
- **AND** the agent has stored the model option ID from initialization
- **THEN** the agent calls `setSessionConfigOption` with that option ID and the requested model ID
- **AND** the agent reports the updated model state back to the platform

#### Scenario: Platform sets Codex mode
- **WHEN** mimo-platform sends a `set_mode` command with a Codex mode ID
- **AND** the agent has stored the mode option ID from initialization
- **THEN** the agent calls `setSessionConfigOption` with that option ID and the requested mode ID
- **AND** the agent reports the updated mode state back to the platform

### Requirement: Codex provider maps streaming updates
The system SHALL translate Codex streaming updates into mimo messages: `agent_thought_chunk` → thought chunk, `agent_message_chunk` → message chunk, `usage_update` → usage update, while forwarding additional update types as generic notifications.

#### Scenario: Codex emits thought chunk
- **WHEN** Codex sends an `agent_thought_chunk` update
- **THEN** the agent emits a `thought_chunk` message with the provided text

#### Scenario: Codex emits message chunk
- **WHEN** Codex sends an `agent_message_chunk` update
- **THEN** the agent emits a `message_chunk` message with the provided text

#### Scenario: Codex emits usage update
- **WHEN** Codex sends a `usage_update`
- **THEN** the agent emits a `usage_update` message with the provided usage metrics

#### Scenario: Codex emits plan update
- **WHEN** Codex sends a `plan_update` or `tool_call_update`
- **THEN** the agent forwards the update type through the generic ACP response channel for the platform to process
