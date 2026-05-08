## ADDED Requirements

### Requirement: List sessions endpoint

The system SHALL provide an internal API endpoint that returns sessions, optionally filtered by project.

#### Scenario: User requests all sessions

- **WHEN** an authenticated GET request is made to `/api/internal/sessions`
- **THEN** the system SHALL return sessions accessible to the user

#### Scenario: User requests sessions by project

- **WHEN** an authenticated GET request is made to `/api/internal/sessions?projectId={id}`
- **THEN** the system SHALL return only sessions for the specified project

### Requirement: Get session endpoint

The system SHALL provide an internal API endpoint that returns a specific session by ID.

#### Scenario: User requests specific session

- **WHEN** an authenticated GET request is made to `/api/internal/sessions/:id`
- **THEN** the system SHALL return the session with the matching ID
- **AND** include full session state, chat threads, and metadata

### Requirement: Create session endpoint

The system SHALL provide an internal API endpoint that creates a new session.

#### Scenario: User creates session

- **WHEN** an authenticated POST request is made to `/api/internal/sessions` with session configuration
- **THEN** the system SHALL create a new session
- **AND** initialize the session workspace
- **AND** return the created session with its ID and port

### Requirement: Update session endpoint

The system SHALL provide an internal API endpoint that updates session properties.

#### Scenario: User updates session name

- **WHEN** an authenticated PUT request is made to `/api/internal/sessions/:id` with name update
- **THEN** the system SHALL update the session name

### Requirement: Delete session endpoint

The system SHALL provide an internal API endpoint that deletes a session.

#### Scenario: User deletes session

- **WHEN** an authenticated DELETE request is made to `/api/internal/sessions/:id`
- **THEN** the system SHALL delete the session and cleanup resources

### Requirement: Get session chat history endpoint

The system SHALL provide an internal API endpoint that returns chat history for a session.

#### Scenario: User requests chat history

- **WHEN** an authenticated GET request is made to `/api/internal/sessions/:id/chat`
- **THEN** the system SHALL return the chat history for the session
- **AND** include all messages with their metadata

### Requirement: Assign agent to session endpoint

The system SHALL provide an internal API endpoint that assigns an agent to a session.

#### Scenario: User assigns agent

- **WHEN** an authenticated POST request is made to `/api/internal/sessions/:id/assign-agent` with agentId
- **THEN** the system SHALL assign the agent to the session
- **AND** update the session state
