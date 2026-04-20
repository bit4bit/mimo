## MODIFIED Requirements

### Requirement: User can create a session
The system SHALL create sessions with retention metadata for TTL-based cleanup.

#### Scenario: Create session with default retention
- **WHEN** authenticated user creates a session
- **THEN** system stores `sessionTtlDays: 180`
- **AND** system stores `lastActivityAt: null`

#### Scenario: Create session with explicit TTL days
- **WHEN** authenticated user creates a session with valid `sessionTtlDays`
- **THEN** system stores provided `sessionTtlDays` value
- **AND** system stores `lastActivityAt: null`

### Requirement: Session runtime settings can be updated
The system SHALL allow updating session TTL in days.

#### Scenario: Update TTL days
- **WHEN** user updates runtime settings with valid `sessionTtlDays`
- **THEN** system persists new `sessionTtlDays`
- **AND** value is interpreted as calendar-day retention from `createdAt`

#### Scenario: Reject invalid TTL days
- **WHEN** user sends `sessionTtlDays` less than `1` or non-integer
- **THEN** system rejects request with validation error

### Requirement: User can delete a session
The system SHALL delete sessions manually or automatically using same cleanup logic.

#### Scenario: Auto-delete expired and inactive session
- **GIVEN** session with `sessionTtlDays` elapsed since `createdAt`
- **AND** session has no activity in last 10 minutes
- **WHEN** retention sweeper runs (every 10 minutes)
- **THEN** system deletes session via same cleanup workflow as manual delete

#### Scenario: Skip expired but active session
- **GIVEN** session TTL elapsed
- **AND** session has activity within last 10 minutes
- **WHEN** retention sweeper runs
- **THEN** system MUST NOT delete session

#### Scenario: Manual delete availability gated by inactivity
- **WHEN** user opens session detail for active session (activity within last 10 minutes)
- **THEN** Delete Session button is not shown
- **AND** button is shown when session becomes inactive
