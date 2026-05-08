## MODIFIED Requirements

### Requirement: Active chat thread is persisted

The system SHALL persist which chat thread is currently active for the session UI.

#### Scenario: Activate chat thread during streaming

- **WHEN** user activates thread "Reviewer" while "Main" has an active streaming response
- **THEN** system stores `activeChatThreadId` as "Reviewer" thread ID
- **AND** frontend clears all streaming state references (messageElement, thoughtElement, content buffers)
- **AND** frontend clears pending message tracking
- **AND** next page load opens "Reviewer" thread as active

#### Scenario: Return to thread with in-progress message

- **WHEN** user returns to thread "Main" after switching away during streaming
- **THEN** system loads persisted history for "Main"
- **AND** frontend reconstructs streaming UI from server state if streaming is still active
- **AND** accumulated content is visible to user

### Requirement: Session supports multiple chat threads

The system SHALL allow multiple chat threads within a single session.

#### Scenario: Thread switch preserves cancelled messages

- **WHEN** user cancels a streaming response on thread "Main"
- **AND** switches to thread "Reviewer"
- **AND** returns to thread "Main"
- **THEN** cancelled message is visible in history
- **AND** message shows cancelled indicator
