## MODIFIED Requirements

### Requirement: User can delete a session
The system SHALL allow users to remove sessions.

#### Scenario: Delete session with cleanup
- **WHEN** authenticated user deletes session "fix-auth-bug"
- **THEN** system terminates agent process if running
- **AND** system stops Fossil server if running
- **AND** system cancels any pending tool approval requests for the session
- **AND** system removes entire session directory including checkout/ and repo.fossil
