## MODIFIED Requirements

### Requirement: Thread Binding

The instruction input SHALL use the session's active expert thread (`activeExpertThreadId`), not the active chat thread. The thread name SHALL be displayed in the context bar. If `activeExpertThreadId` is null, the input SHALL show "Create a chat thread first" and be disabled.

#### Scenario: Active expert thread exists

- **WHEN** expert mode is enabled and `activeExpertThreadId` points at a valid thread
- **THEN** the instruction input is enabled
- **AND** submitted instructions are routed to that thread's ACP runtime
- **AND** the thread name is displayed in the context bar

#### Scenario: No active expert thread

- **WHEN** expert mode is enabled and `activeExpertThreadId` is null
- **THEN** the instruction input is disabled
- **AND** the input shows "Create a chat thread first"