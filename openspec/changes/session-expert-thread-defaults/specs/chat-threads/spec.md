## ADDED Requirements

### Requirement: Active expert thread is persisted

The system SHALL persist `activeExpertThreadId` on the session, independent from `activeChatThreadId`. The expert thread pointer SHALL NOT be derived from or fall back to the chat pointer.

#### Scenario: Persist expert thread across page loads

- **WHEN** user sets `activeExpertThreadId` to a thread
- **AND** reloads the session page
- **THEN** the expert thread pointer is restored from `session.yaml`
- **AND** expert mode binds to the same thread

#### Scenario: Chat and expert pointers are independent

- **WHEN** `activeChatThreadId` is set to thread "X"
- **AND** `activeExpertThreadId` is set to thread "Y"
- **THEN** both pointers are persisted independently
- **AND** updating one SHALL NOT mutate the other