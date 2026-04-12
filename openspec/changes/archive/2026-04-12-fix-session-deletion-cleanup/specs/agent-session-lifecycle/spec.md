## ADDED Requirements

### Requirement: Agent handles session deletion notifications
The agent SHALL handle `session_ended` messages from the platform and clean up all session resources.

#### Scenario: Session ended message received
- **WHEN** platform sends `{ type: "session_ended", sessionId: "abc123" }` to agent
- **THEN** agent SHALL terminate the ACP process for that session
- **AND** agent SHALL remove the session from acpClients Map
- **AND** agent SHALL terminate file watchers and pending timers
- **AND** agent SHALL remove the session from SessionManager

#### Scenario: Session ended for unknown session
- **WHEN** platform sends `session_ended` for a session ID not known to agent
- **THEN** agent SHALL log a warning
- **AND** agent SHALL not throw an error
- **AND** agent SHALL continue normal operation

#### Scenario: Duplicate session ended messages
- **WHEN** platform sends `session_ended` for a session that was already cleaned up
- **THEN** agent SHALL handle it idempotently
- **AND** agent SHALL not throw an error
- **AND** agent SHALL log the duplicate cleanup attempt

### Requirement: Agent session cleanup is complete
When cleaning up a session, the agent SHALL ensure all resources are released.

#### Scenario: Active ACP request during cleanup
- **GIVEN** session "abc123" has an active ACP prompt in progress
- **WHEN** agent receives `session_ended` for "abc123"
- **THEN** agent SHALL abort the in-flight ACP request
- **AND** agent SHALL terminate the ACP process
- **AND** agent SHALL clean up session resources

#### Scenario: File watcher cleanup
- **GIVEN** session "abc123" has an active file watcher
- **WHEN** agent receives `session_ended` for "abc123"
- **THEN** agent SHALL close the file watcher
- **AND** agent SHALL clear any pending file change timers
- **AND** agent SHALL not emit file change events after cleanup
