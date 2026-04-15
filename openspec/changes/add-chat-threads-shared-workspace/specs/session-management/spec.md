## MODIFIED Requirements

### Requirement: User can create a session
The system SHALL initialize each new session with a default chat thread.

#### Scenario: Create session creates default thread
- **WHEN** authenticated user creates a new session
- **THEN** system creates session resources (`upstream`, checkout, `repo.fossil`) as usual
- **AND** system creates default chat thread named `Main`
- **AND** system stores `activeChatThreadId` as `Main` thread ID

### Requirement: User can delete a session
The system SHALL remove all chat-thread runtimes and metadata when deleting a session.

#### Scenario: Delete session with multiple threads
- **WHEN** authenticated user deletes a session with 3 chat threads
- **THEN** system terminates or parks all ACP runtimes for those threads
- **AND** system removes thread metadata alongside session data
- **AND** system removes session checkout and `repo.fossil`
