## ADDED Requirements

### Requirement: Agent advertises capabilities on connect
The system SHALL accept an `agent_capabilities` message from the agent immediately after `agent_ready` and persist the declared capabilities to `agent.yaml`.

#### Scenario: Agent sends capabilities on connect
- **WHEN** agent sends `agent_capabilities` message with `{ availableModels, defaultModelId, availableModes, defaultModeId }`
- **THEN** system stores capabilities on agent entity in `agent.yaml`
- **AND** system updates agent's `updatedAt` timestamp

#### Scenario: Agent reconnects and re-advertises
- **WHEN** agent reconnects and sends `agent_capabilities` again
- **THEN** system overwrites previously stored capabilities with new values
- **AND** previous cached state is not retained

### Requirement: Platform exposes agent capabilities via API
The system SHALL provide an endpoint to retrieve cached capabilities for a given agent.

#### Scenario: Fetch capabilities for online agent
- **WHEN** authenticated user sends `GET /agents/:agentId/capabilities`
- **AND** agent has previously advertised capabilities
- **THEN** system returns `{ availableModels, defaultModelId, availableModes, defaultModeId }`
- **AND** response status is 200

#### Scenario: Fetch capabilities for agent with no cached state
- **WHEN** authenticated user sends `GET /agents/:agentId/capabilities`
- **AND** agent has never sent `agent_capabilities`
- **THEN** system returns 404

### Requirement: Thread creation dialog fetches agent capabilities synchronously
The system SHALL populate model and mode selectors in the thread creation dialog based on the selected agent's cached capabilities.

#### Scenario: User selects agent in thread creation dialog
- **WHEN** user opens thread creation dialog
- **AND** user selects an agent from the agent dropdown
- **THEN** dialog fetches `GET /agents/:agentId/capabilities`
- **AND** model selector is populated with `availableModels`
- **AND** model selector default is set to `defaultModelId`
- **AND** mode selector is populated with `availableModes`
- **AND** mode selector default is set to `defaultModeId`

#### Scenario: User changes agent selection
- **WHEN** user changes the selected agent in thread creation dialog
- **THEN** dialog re-fetches capabilities for the newly selected agent
- **AND** model and mode selectors are repopulated with new agent's capabilities

### Requirement: session_initialized re-caches agent capabilities
The system SHALL update the agent's stored capabilities whenever `session_initialized` is received.

#### Scenario: Agent sends session_initialized with updated model state
- **WHEN** agent sends `session_initialized` with `modelState` and `modeState`
- **THEN** system updates agent's cached capabilities from the new state
- **AND** thread model and mode are synced as before
