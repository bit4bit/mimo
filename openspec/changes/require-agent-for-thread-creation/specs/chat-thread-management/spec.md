## ADDED Requirements

### Requirement: Thread creation requires an assigned agent
The system SHALL require `assignedAgentId` when creating a chat thread.

#### Scenario: Create thread with assigned agent
- **WHEN** an authenticated user sends `POST /sessions/:id/chat-threads` with `name`, `model`, `mode`, and a non-empty `assignedAgentId`
- **THEN** the system creates the thread
- **AND** the new thread stores the provided `assignedAgentId`

#### Scenario: Reject thread creation without assigned agent
- **WHEN** an authenticated user sends `POST /sessions/:id/chat-threads` without `assignedAgentId` or with an empty value
- **THEN** the system returns HTTP 400
- **AND** the response includes a validation error indicating `assignedAgentId` is required

### Requirement: Create-thread UI enforces agent selection
The system SHALL require agent selection in the create-thread dialog before submitting thread creation.

#### Scenario: User attempts to create thread without agent selected
- **WHEN** the user opens the create-thread dialog and does not choose an agent
- **THEN** the UI blocks submission
- **AND** the UI shows a validation prompt asking the user to select an agent
