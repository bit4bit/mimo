## ADDED Requirements

### Requirement: Get session summary endpoint
The system SHALL provide an internal API endpoint that returns or generates a summary for a session.

#### Scenario: User requests session summary
- **WHEN** an authenticated GET request is made to `/api/internal/summary/:sessionId`
- **THEN** the system SHALL return the session summary
- **AND** include generated summary text and metadata

#### Scenario: Summary needs generation
- **WHEN** a summary is requested but does not exist
- **THEN** the system SHALL generate the summary from session chat history
- **AND** store it for future requests

### Requirement: Regenerate summary endpoint
The system SHALL provide an internal API endpoint that regenerates a session summary.

#### Scenario: User requests summary regeneration
- **WHEN** an authenticated POST request is made to `/api/internal/summary/:sessionId/regenerate`
- **THEN** the system SHALL regenerate the summary from current chat history
- **AND** return the updated summary
