## ADDED Requirements

### Requirement: Agent created with provider
The system SHALL require a provider when creating an agent and store it in the agent record.

#### Scenario: Create agent with opencode provider
- **WHEN** user creates an agent with provider="opencode"
- **THEN** system stores provider="opencode" in agent.yaml
- **AND** system includes provider="opencode" in JWT token payload

#### Scenario: Create agent with claude provider
- **WHEN** user creates an agent with provider="claude"
- **THEN** system stores provider="claude" in agent.yaml
- **AND** system includes provider="claude" in JWT token payload

#### Scenario: Attempt to create agent without provider
- **WHEN** user attempts to create an agent without specifying provider
- **THEN** system returns error "Provider is required"

### Requirement: Agent validates provider on startup
The system SHALL validate that the declared provider matches the token's embedded provider before establishing connection.

#### Scenario: Agent starts with matching provider
- **WHEN** mimo-agent starts with --provider="opencode"
- **AND** token contains provider="opencode"
- **THEN** validation passes
- **AND** agent proceeds to connect to platform

#### Scenario: Agent starts with mismatched provider
- **WHEN** mimo-agent starts with --provider="claude"
- **AND** token contains provider="opencode"
- **THEN** system logs error to stderr
- **AND** system exits with code 1
- **AND** error message includes "Provider mismatch: agent declares 'claude' but token requires 'opencode'"

#### Scenario: Agent starts without provider flag
- **WHEN** mimo-agent starts without --provider flag
- **THEN** system logs error to stderr
- **AND** system exits with code 1
- **AND** error message includes "Missing required argument: --provider"

#### Scenario: Agent token missing provider claim (backward compatibility)
- **WHEN** mimo-agent starts with --provider="opencode"
- **AND** token does not contain provider claim (legacy token)
- **THEN** system treats missing provider as "opencode"
- **AND** validation passes
- **AND** system logs warning "Using legacy token, defaulting provider to 'opencode'"
