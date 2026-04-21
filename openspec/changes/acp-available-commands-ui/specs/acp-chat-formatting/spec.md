## MODIFIED Requirements

### Requirement: Forward available_commands_update for chat command UX
The system SHALL forward ACP `available_commands_update` notifications as structured command metadata for session chat UX.

#### Scenario: Commands update is forwarded
- **WHEN** the agent receives an ACP `sessionUpdate` with `sessionUpdate: "available_commands_update"`
- **THEN** the system SHALL emit a dedicated command update event to the platform
- **AND** the update SHALL NOT be emitted as assistant chat message content

#### Scenario: Command update does not pollute transcript
- **WHEN** command updates are received during an active chat session
- **THEN** the system SHALL NOT persist command update payload as `assistant` or `user` chat message content
