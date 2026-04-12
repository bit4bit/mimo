## ADDED Requirements

### Requirement: Auto-commit on thought end
The system SHALL automatically commit and push pending changes when the agent emits a `thought_end` event.

#### Scenario: Agent completes thinking with changes
- **WHEN** the agent emits a `thought_end` event for a session
- **AND** there are uncommitted changes in the session's upstream directory
- **THEN** the system SHALL commit those changes with a message containing the session name and file/line statistics
- **AND** the system SHALL push the commit to the remote repository

#### Scenario: Agent completes thinking without changes
- **WHEN** the agent emits a `thought_end` event for a session
- **AND** there are no uncommitted changes in the session's upstream directory
- **THEN** the system SHALL skip the commit operation
- **AND** no commit SHALL be created

#### Scenario: Commit message generation
- **WHEN** auto-commit is triggered
- **THEN** the commit message SHALL include the session name
- **AND** the commit message SHALL include the number of files changed
- **AND** the commit message SHALL include lines added and removed counts
- **AND** the commit message format SHALL be `"[SessionName] - X files changed (+Y/-Z lines)"`

### Requirement: Sync status visibility
The system SHALL provide visibility into the sync state of each session.

#### Scenario: Successful sync
- **WHEN** auto-commit completes successfully
- **THEN** the system SHALL record the sync timestamp
- **AND** the sync status SHALL be available via the session API

#### Scenario: Sync failure
- **WHEN** auto-commit or push fails
- **THEN** the system SHALL record the error
- **AND** the error SHALL be available via the session API
- **AND** the sync status SHALL indicate failure

### Requirement: Manual sync trigger
The system SHALL provide a mechanism for users to manually trigger sync.

#### Scenario: User triggers manual sync
- **WHEN** a user sends a POST request to `/sessions/:sessionId/sync`
- **THEN** the system SHALL perform the same commit and push operation as auto-commit
- **AND** the system SHALL return the operation result (success or error)

#### Scenario: Manual sync with no changes
- **WHEN** a user triggers manual sync
- **AND** there are no uncommitted changes
- **THEN** the system SHALL return a success response indicating no changes

### Requirement: Error handling and retry
The system SHALL handle sync errors gracefully and allow retry.

#### Scenario: Push fails due to network error
- **WHEN** auto-commit push fails due to a network error
- **THEN** the error SHALL be recorded in the session state
- **AND** the user SHALL be able to retry via the manual sync endpoint

#### Scenario: Push fails due to conflict
- **WHEN** auto-commit push fails due to upstream conflicts
- **THEN** the error SHALL be recorded with conflict details
- **AND** the user SHALL be informed they need to resolve conflicts externally
