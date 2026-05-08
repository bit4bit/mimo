## ADDED Requirements

### Requirement: initializing is a valid thread lifecycle state

The `AcpSessionState` type SHALL include `"initializing"` as a state representing a thread whose ACP process has been spawned but whose `initialize()` handshake has not yet completed.

#### Scenario: thread transitions from none to initializing on first spawn

- **WHEN** `ensureThreadRuntime` is triggered for a thread with no prior state
- **THEN** the thread state is set to `"initializing"` before ACP initialization completes

#### Scenario: thread transitions from initializing to active on success

- **WHEN** ACP initialization completes successfully for an `"initializing"` thread
- **THEN** the thread state transitions to `"active"`
