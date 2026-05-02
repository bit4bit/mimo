## ADDED Requirements

### Requirement: Refresh summary endpoint
The system SHALL provide an internal API endpoint that triggers summary generation for a session.

#### Scenario: User requests summary generation
- **WHEN** an authenticated POST request is made to `/api/internal/summary/refresh` with sessionId, analyzeThreadId, and summarizeThreadId
- **THEN** the system SHALL validate the session exists
- **AND** verify an agent is assigned to the summarize thread
- **AND** verify the agent is connected
- **AND** load chat history from analyze thread
- **AND** send summary prompt to the agent
- **AND** return confirmation that request was sent

#### Scenario: User requests summary with missing parameters
- **WHEN** a POST request is made without sessionId, analyzeThreadId, or summarizeThreadId
- **THEN** the system SHALL return a 400 error

#### Scenario: Agent not connected
- **WHEN** a summary refresh is requested but the agent is not connected
- **THEN** the system SHALL return a 400 error indicating agent is not active

### Requirement: Get latest summary endpoint
The system SHALL provide an internal API endpoint that returns the latest generated summary for a session.

#### Scenario: User requests latest summary
- **WHEN** an authenticated GET request is made to `/api/internal/summary/latest` with sessionId and summarizeThreadId
- **THEN** the system SHALL load chat history from the thread
- **AND** return the content of the latest assistant message
- **AND** strip thought process blocks from the content

#### Scenario: No summary available
- **WHEN** a GET request is made for a thread with no assistant messages
- **THEN** the system SHALL return an empty summary
