## MODIFIED Requirements

### Requirement: User can delete a session
The system SHALL allow users to remove sessions. When deleting a session, the system SHALL notify the assigned agent to clean up resources.

#### Scenario: Delete session with cleanup
- **WHEN** authenticated user deletes session "fix-auth-bug"
- **THEN** system sends `session_ended` message to assigned agent
- **AND** system waits for agent acknowledgment (optional, non-blocking)
- **AND** system terminates agent process if running
- **AND** system stops Fossil server if running
- **AND** system removes entire session directory including checkout/ and repo.fossil

#### Scenario: Delete session without assigned agent
- **WHEN** authenticated user deletes session that has no assigned agent
- **THEN** system removes entire session directory including checkout/ and repo.fossil
- **AND** system does not attempt to notify agent

#### Scenario: Delete session when agent is offline
- **WHEN** authenticated user deletes session with assigned agent that is offline
- **THEN** system sends `session_ended` message (if agent reconnects, it will receive the message)
- **AND** system proceeds with session directory cleanup
- **AND** system does not block on agent response
