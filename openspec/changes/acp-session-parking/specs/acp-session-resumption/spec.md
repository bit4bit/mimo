## ADDED Requirements

### Requirement: ACP session can be resumed with cached credentials
The system SHALL restore a previously parked ACP session using cached `acpSessionId`, `modelState`, and `modeState`.

#### Scenario: Successful session resumption
- **GIVEN** a session with cached `acpSessionId`, `modelState`, and `modeState`
- **WHEN** the ACP process spawns and initializes
- **THEN** the system SHALL call `loadSession()` with the cached `acpSessionId`
- **AND** if successful, the session context SHALL be preserved
- **AND** the system SHALL call `setModel()` with the cached `modelState.currentModelId`
- **AND** the system SHALL call `setMode()` with the cached `modeState.currentModeId`

#### Scenario: Resumption with model/mode restoration
- **GIVEN** a successful session resumption (either via `loadSession` or `newSession`)
- **WHEN** the ACP session is initialized
- **THEN** the system SHALL restore the cached model selection
- **AND** the system SHALL restore the cached mode selection
- **AND** the user SHALL experience the same configuration as before parking

### Requirement: Both providers support session resumption
The system SHALL support session resumption for both opencode and claude-agent-acp providers.

#### Scenario: Resumption with opencode provider
- **GIVEN** a session using opencode provider
- **WHEN** resuming from parked state
- **THEN** the system SHALL attempt to use the ACP protocol's session/load method
- **AND** opencode SHALL restore the previous session state

#### Scenario: Resumption with claude-agent-acp provider
- **GIVEN** a session using claude-agent-acp provider
- **WHEN** resuming from parked state
- **THEN** the system SHALL use the native `loadSession()` method
- **AND** claude-agent-acp SHALL restore the previous session state
