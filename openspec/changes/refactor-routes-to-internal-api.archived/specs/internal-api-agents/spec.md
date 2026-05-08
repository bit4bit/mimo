## ADDED Requirements

### Requirement: List agents endpoint

The system SHALL provide an internal API endpoint that returns all agents for the authenticated user.

#### Scenario: User requests agent list

- **WHEN** an authenticated GET request is made to `/api/internal/agents`
- **THEN** the system SHALL return all agents owned by the user
- **AND** include id, name, status, and metadata

### Requirement: Get agent endpoint

The system SHALL provide an internal API endpoint that returns a specific agent by ID.

#### Scenario: User requests specific agent

- **WHEN** an authenticated GET request is made to `/api/internal/agents/:id`
- **THEN** the system SHALL return the agent with full details
- **AND** include assigned sessions and capabilities

### Requirement: Create agent endpoint

The system SHALL provide an internal API endpoint that creates a new agent.

#### Scenario: User creates agent

- **WHEN** an authenticated POST request is made to `/api/internal/agents` with agent configuration
- **THEN** the system SHALL create a new agent
- **AND** return the created agent with its ID and token

### Requirement: Update agent endpoint

The system SHALL provide an internal API endpoint that updates agent properties.

#### Scenario: User updates agent

- **WHEN** an authenticated PUT request is made to `/api/internal/agents/:id` with update data
- **THEN** the system SHALL update the agent properties

### Requirement: Delete agent endpoint

The system SHALL provide an internal API endpoint that deletes an agent.

#### Scenario: User deletes agent

- **WHEN** an authenticated DELETE request is made to `/api/internal/agents/:id`
- **THEN** the system SHALL delete the agent and invalidate its token

### Requirement: Get agent capabilities endpoint

The system SHALL provide an internal API endpoint that returns agent capabilities.

#### Scenario: User requests agent capabilities

- **WHEN** an authenticated GET request is made to `/api/internal/agents/:id/capabilities`
- **THEN** the system SHALL return the agent's available models and modes

### Requirement: Refresh agent capabilities endpoint

The system SHALL provide an internal API endpoint that refreshes agent capabilities from the agent.

#### Scenario: User refreshes capabilities

- **WHEN** an authenticated POST request is made to `/api/internal/agents/:id/capabilities/refresh`
- **THEN** the system SHALL request fresh capabilities from the agent
- **AND** update the stored capabilities
