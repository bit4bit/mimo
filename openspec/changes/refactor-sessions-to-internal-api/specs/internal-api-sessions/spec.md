## ADDED Requirements

### Requirement: List sessions endpoint
The system SHALL provide an internal API endpoint that returns sessions.

#### Scenario: User requests sessions
- **WHEN** a GET request is made to `/api/internal/sessions`
- **THEN** the system SHALL return accessible sessions

### Requirement: Get session endpoint
The system SHALL provide an internal API endpoint that returns a specific session.

#### Scenario: User requests specific session
- **WHEN** a GET request is made to `/api/internal/sessions/:id`
- **THEN** the system SHALL return the session with full state

### Requirement: Create session endpoint
The system SHALL provide an internal API endpoint that creates a session.

#### Scenario: User creates session
- **WHEN** a POST request is made to `/api/internal/sessions` with configuration
- **THEN** the system SHALL create the session and return it

### Requirement: Update session endpoint
The system SHALL provide an internal API endpoint that updates a session.

#### Scenario: User updates session
- **WHEN** a PUT request is made to `/api/internal/sessions/:id` with updates
- **THEN** the system SHALL update the session

### Requirement: Delete session endpoint
The system SHALL provide an internal API endpoint that deletes a session.

#### Scenario: User deletes session
- **WHEN** a DELETE request is made to `/api/internal/sessions/:id`
- **THEN** the system SHALL delete the session

### Requirement: Get session chat history endpoint
The system SHALL provide an internal API endpoint that returns chat history.

#### Scenario: User requests chat history
- **WHEN** a GET request is made to `/api/internal/sessions/:id/chat`
- **THEN** the system SHALL return the chat history

### Requirement: Assign agent to session endpoint
The system SHALL provide an internal API endpoint that assigns an agent.

#### Scenario: User assigns agent
- **WHEN** a POST request is made to `/api/internal/sessions/:id/assign-agent` with agentId
- **THEN** the system SHALL assign the agent to the session
