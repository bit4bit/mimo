## MODIFIED Requirements

### Requirement: Agent reports file changes to platform

The system SHALL receive file change notifications from mimo-agent with repo-qualified file identities. For newly created files, the `isNew` field SHALL be `true`.

#### Scenario: Single file change

- **WHEN** agent modifies file "src/app.js" in repository "backend"
- **THEN** mimo-agent sends WebSocket message with `{ type: "file_changed", files: [{ repoId: "backend", path: "src/app.js" }] }`
- **AND** platform marks that repository file with [M] indicator

#### Scenario: New file created

- **WHEN** agent creates new file "src/new.ts" in repository "frontend" that does not exist on disk before the write
- **THEN** mimo-agent sends message with `{ type: "file_changed", files: [{ repoId: "frontend", path: "src/new.ts" }], isNew: true }`
- **AND** platform marks that repository file with [?] indicator

### Requirement: Platform synchronizes changes to original repository

The system SHALL copy changed files from each agent repository worktree to the matching original repository worktree.

#### Scenario: Sync modified file

- **WHEN** platform receives a repo-qualified file change notification
- **THEN** system copies the file from the session repository worktree to the matching upstream repository worktree
- **AND** system preserves file permissions

#### Scenario: Batch sync on reconnect

- **WHEN** user reconnects after offline period
- **THEN** system receives all buffered repo-qualified file changes
- **AND** system syncs each file to its matching upstream repository worktree

### Requirement: Platform handles file deletions

The system SHALL detect and sync repo-qualified file deletions.

#### Scenario: File deleted by agent

- **WHEN** agent deletes file "src/old.js" in repository "backend"
- **THEN** mimo-agent sends message with `{ type: "file_changed", files: [{ repoId: "backend", path: "src/old.js" }], deleted: true }`
- **AND** platform marks that repository file with [D] indicator
- **AND** system removes the file from the matching upstream repository worktree
