## ADDED Requirements

### Requirement: Agent reports file changes to platform

The system SHALL receive file change notifications from mimo-agent. For newly created files, the `isNew` field SHALL be `true`.

#### Scenario: Single file change

- **WHEN** agent modifies file "src/app.js"
- **THEN** mimo-agent sends WebSocket message: {type: "file_changed", files: ["src/app.js"]}
- **AND** platform marks file with [M] indicator

#### Scenario: Multiple file changes

- **WHEN** agent modifies multiple files
- **THEN** mimo-agent sends single message with all changed files
- **AND** platform updates all file indicators

#### Scenario: New file created

- **WHEN** agent creates new file "src/new.ts" that does not exist on disk before the write
- **THEN** mimo-agent sends message: {type: "file_changed", files: ["src/new.ts"], isNew: true}
- **AND** platform marks file with [?] indicator

#### Scenario: Existing file overwritten

- **WHEN** agent writes to an existing file "src/existing.ts"
- **THEN** mimo-agent sends message: {type: "file_changed", files: ["src/existing.ts"], isNew: false}
- **AND** platform marks file with [M] indicator

### Requirement: Platform synchronizes changes to original repository

The system SHALL copy changed files from agent worktree to original repository worktree.

#### Scenario: Sync modified file

- **WHEN** platform receives file change notification
- **THEN** system copies file from session worktree to original repo worktree
- **AND** system preserves file permissions

#### Scenario: Sync new file

- **WHEN** platform receives new file notification
- **THEN** system copies file and creates parent directories if needed
- **AND** system preserves file permissions

#### Scenario: Batch sync on reconnect

- **WHEN** user reconnects after offline period
- **THEN** system receives all buffered file changes
- **AND** system syncs all files to original repo worktree

### Requirement: Platform detects conflicts

The system SHALL identify when agent changes conflict with original repository changes.

#### Scenario: Conflict detection

- **WHEN** platform attempts sync and detects file was modified in original repo
- **THEN** system marks file with conflict indicator [!]
- **AND** system displays "Conflicts detected" in changes buffer
- **AND** system requires manual resolution

#### Scenario: Show conflict details

- **WHEN** user clicks conflicted file
- **THEN** system displays diff between agent version and original repo version

### Requirement: Platform handles file deletions

The system SHALL detect and sync file deletions.

#### Scenario: File deleted by agent

- **WHEN** agent deletes file "src/old.js"
- **THEN** mimo-agent sends message: {type: "file_changed", files: ["src/old.js"], deleted: true}
- **AND** platform marks file with [D] indicator
- **AND** system removes file from original repo worktree

### Requirement: File sync is bidirectional

The system SHALL support manual sync from original repo to session.

#### Scenario: Pull latest changes

- **WHEN** user requests sync from original repo
- **THEN** system copies changes from original repo to session worktree
- **AND** system updates file tree indicators
- **AND** system notifies agent of changes

#### Scenario: Sync conflicts with agent changes

- **WHEN** pull conflicts with uncommitted agent changes
- **THEN** system displays conflict warning
- **AND** system requires manual resolution
