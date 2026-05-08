## MODIFIED Requirements

### Requirement: Active chat thread is persisted

The system SHALL persist which chat thread is currently active for the session UI.

#### Scenario: Activate chat thread during prompt processing

- **WHEN** user activates thread "Reviewer" while "Main" has a prompt in flight
- **THEN** system stores activeChatThreadId as "Reviewer" thread ID
- **AND** frontend clears streaming DOM from previous thread
- **AND** when user returns to "Main", streaming_state is received if prompt is still processing
- \*\*AND" frontend reconstructs "Received, processing..." indicator

### Requirement: Session supports multiple chat threads

The system SHALL allow multiple chat threads within a single session.

#### Scenario: Thread switch preserves processing state

- **WHEN** user sends a message on thread "Main"
- **AND** agent begins processing but no chunks arrive yet
- **AND** user switches to thread "Reviewer"
- **AND** user returns to thread "Main"
- **THEN** "Received, processing..." indicator is visible
- **AND** indicator shows until usage_update or error_response arrives
