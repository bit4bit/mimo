## MODIFIED Requirements

### Requirement: Claude provider streams thought and message chunks

The system SHALL map ACP update types from `claude-agent-acp` to mimo message types and forward them to the platform. This SHALL include the `plan` session update, which carries the agent's full plan entry list and which was previously unmapped and therefore dropped.

#### Scenario: Thought chunk forwarded

- **WHEN** `claude-agent-acp` emits an `agent_thought_chunk` update
- **THEN** agent forwards it as a `thought_chunk` message to the platform

#### Scenario: Message chunk forwarded

- **WHEN** `claude-agent-acp` emits an `agent_message_chunk` update
- **THEN** agent forwards it as a `message_chunk` message to the platform

#### Scenario: Plan update forwarded

- **WHEN** `claude-agent-acp` emits a `plan` session update with plan entries
- **THEN** agent maps it via `mapUpdateType` and forwards the entries to the platform as a `plan` message
- **AND** the update is no longer silently dropped

#### Scenario: Unknown update types are silently skipped

- **WHEN** `claude-agent-acp` emits an update type not mapped by the provider
- **THEN** agent silently ignores it without error
