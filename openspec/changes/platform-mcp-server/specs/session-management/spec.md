## MODIFIED Requirements

### Requirement: Session MCP Token
Each session SHALL have a stable, unique MCP token used to authenticate platform MCP requests.

#### Scenario: Token generated at session creation
- **WHEN** a new session is created
- **THEN** the platform SHALL generate a UUID and store it as `mcpToken` on the session record
- **AND** the token SHALL be persisted to the session YAML file

#### Scenario: Token is stable across restarts
- **WHEN** the platform restarts and loads sessions from storage
- **THEN** each session's `mcpToken` SHALL be the same value as when the session was created
- **AND** the token map SHALL be rebuilt from the loaded sessions

#### Scenario: Token removed on session deletion
- **WHEN** a session is deleted
- **THEN** its `mcpToken` SHALL be removed from the in-memory token map
- **AND** any subsequent MCP request using that token SHALL receive a 401 response
