## ADDED Requirements

### Requirement: List agents endpoint
The system SHALL provide an internal API endpoint that returns agents.

#### Scenario: User requests agents
- **WHEN** a GET request is made to `/api/internal/agents`
- **THEN** the system SHALL return agents owned by the user

### Requirement: Get agent endpoint
The system SHALL provide an internal API endpoint that returns a specific agent.

#### Scenario: User requests specific agent
- **WHEN** a GET request is made to `/api/internal/agents/:id`
- **THEN** the system SHALL return the agent with full details

### Requirement: Create agent endpoint
The system SHALL provide an internal API endpoint that creates an agent.

#### Scenario: User creates agent
- **WHEN** a POST request is made to `/api/internal/agents` with configuration
- **THEN** the system SHALL create the agent and return it with token

### Requirement: Update agent endpoint
The system SHALL provide an internal API endpoint that updates an agent.

#### Scenario: User updates agent
- **WHEN** a PUT request is made to `/api/internal/agents/:id` with updates
- **THEN** the system SHALL update the agent

### Requirement: Delete agent endpoint
The system SHALL provide an internal API endpoint that deletes an agent.

#### Scenario: User deletes agent
- **WHEN** a DELETE request is made to `/api/internal/agents/:id`
- **THEN** the system SHALL delete the agent

### Requirement: Get agent capabilities endpoint
The system SHALL provide an internal API endpoint that returns agent capabilities.

#### Scenario: User requests capabilities
- **WHEN** a GET request is made to `/api/internal/agents/:id/capabilities`
- **THEN** the system SHALL return the agent's capabilities

### Requirement: Refresh agent capabilities endpoint
The system SHALL provide an internal API endpoint that refreshes capabilities.

#### Scenario: User refreshes capabilities
- **WHEN** a POST request is made to `/api/internal/agents/:id/capabilities/refresh`
- **THEN** the system SHALL request fresh capabilities from the agent
