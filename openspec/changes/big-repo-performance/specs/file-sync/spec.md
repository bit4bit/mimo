## MODIFIED Requirements

### Requirement: Platform synchronizes changes to original repository
The system SHALL copy changed files from agent worktree to original repository worktree.

#### Scenario: Sync modified file
- **WHEN** platform receives file change notification
- **THEN** system copies file from session worktree to original repo worktree
- **AND** system preserves file permissions
- **AND** system records the original file's checksum as baseline on first sync of that path

#### Scenario: Sync new file
- **WHEN** platform receives new file notification
- **THEN** system copies file and creates parent directories if needed
- **AND** system preserves file permissions
- **AND** system records the copied file's checksum as baseline

#### Scenario: Batch sync on reconnect
- **WHEN** user reconnects after offline period
- **THEN** system receives all buffered file changes
- **AND** system syncs all files to original repo worktree
- **AND** system records baselines for each synced path without scanning the rest of the repository
