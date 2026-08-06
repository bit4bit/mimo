## MODIFIED Requirements

### Requirement: Auto-commit on thought end

The system SHALL automatically commit and push pending changes for each session repository when the agent emits a `thought_end` event. Auto-commit SHALL be best-effort per repository.

#### Scenario: Agent completes thinking with changes

- **WHEN** the agent emits a `thought_end` event for a session
- **AND** there are uncommitted changes in one or more session repositories
- **THEN** the system commits those changes per repository with a message containing the session name and file/line statistics
- **AND** pushes each repository commit to its matching remote

#### Scenario: Agent completes thinking without changes

- **WHEN** the agent emits a `thought_end` event for a session
- **AND** there are no uncommitted changes in any session repository
- **THEN** the system skips the commit operation for all repositories

#### Scenario: Partial auto-commit failure

- **WHEN** auto-commit succeeds for repository "frontend" but fails for repository "backend"
- **THEN** the system records per-repository results
- **AND** does not roll back the successful frontend commit
- **AND** exposes the backend failure through sync status

### Requirement: Sync status visibility

The system SHALL provide visibility into the sync state of each session repository.

#### Scenario: Successful sync

- **WHEN** auto-commit completes successfully for a repository
- **THEN** the system records that repository sync timestamp
- **AND** the sync status is available via the session API

#### Scenario: Sync failure

- **WHEN** auto-commit or push fails for a repository
- **THEN** the system records that repository error
- **AND** the error is available via the session API
- **AND** the sync status indicates failure for that repository

### Requirement: Manual sync trigger

The system SHALL provide a mechanism for users to manually trigger sync across session repositories.

#### Scenario: User triggers manual sync

- **WHEN** a user sends a POST request to `/sessions/:sessionId/sync`
- **THEN** the system performs the same best-effort commit and push operation per repository as auto-commit
- **AND** returns per-repository operation results
