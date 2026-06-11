## ADDED Requirements

### Requirement: Permission requests can be auto-resolved server-side

The system SHALL support a server-side auto-resolution path for tool permission requests when a thread has brain-wash enabled. When auto-resolved, the request SHALL bypass the browser UI round-trip entirely.

#### Scenario: Auto-resolved request never reaches browser

- **WHEN** a thread has brain-wash enabled
- **AND** the agent requests permission for a tool call
- **THEN** the request SHALL be resolved within the agent process
- **AND** no permission card SHALL appear in any browser tab

#### Scenario: Auto-approval indicator appears in chat

- **WHEN** a tool call is auto-approved by brain-wash
- **THEN** the system SHALL broadcast a message to chat clients
- **AND** the browser SHALL render an inline indicator showing the tool was auto-allowed

#### Scenario: Brain-wash uses "Always Allow" option when available

- **WHEN** a thread has brain-wash enabled
- **AND** the ACP permission options include an "always_allow" option
- **THEN** the system SHALL resolve with optionId "always_allow"

#### Scenario: Brain-wash falls back to "Allow Once" when "Always Allow" unavailable

- **WHEN** a thread has brain-wash enabled
- **AND** the ACP permission options do NOT include an "always_allow" option
- **THEN** the system SHALL resolve with the first available approval option (typically "allow_once")
