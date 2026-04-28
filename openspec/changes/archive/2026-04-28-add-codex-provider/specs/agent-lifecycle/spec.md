## ADDED Requirements

### Requirement: Agent supports codex provider selection
The system SHALL accept `codex` as a valid provider value when initializing mimo-agent, alongside existing options.

#### Scenario: Agent starts with provider codex
- **WHEN** mimo-agent starts with command line flag `--provider codex`
- **THEN** the agent initialises using the Codex provider implementation
- **AND** the agent logs standard startup messages
- **AND** the agent proceeds to establish WebSocket connectivity without provider validation errors
