## ADDED Requirements

### Requirement: Commit modal shows change tree preview
The system SHALL show a directory-tree preview of pending changes when the user opens the commit modal.

#### Scenario: Open commit modal with pending changes
- **WHEN** the user opens the commit modal
- **THEN** the system displays a tree grouped by directories
- **AND** each file node shows one status: Added, Modified, or Deleted

#### Scenario: Open commit modal with no pending changes
- **WHEN** the user opens the commit modal
- **AND** there are no pending changes
- **THEN** the system displays an empty-state message
- **AND** Commit & Push remains disabled

### Requirement: Commit modal tree is scrollable
The system SHALL allow independent scrolling within the change tree region.

#### Scenario: Large change set
- **WHEN** the tree content exceeds the modal viewport
- **THEN** the tree region scrolls vertically
- **AND** the commit message input and action buttons remain visible

### Requirement: User can select files and directories
The system SHALL allow selecting individual files and whole directories for commit application.

#### Scenario: Select directory
- **WHEN** the user selects a directory node
- **THEN** all descendant files become selected

#### Scenario: Partial descendant selection
- **WHEN** only some descendant files are selected
- **THEN** the parent directory displays an indeterminate state

### Requirement: User can inspect modified file diffs
The system SHALL provide expandable unified diff hunks for modified files in the change tree.

#### Scenario: Expand modified file
- **WHEN** the user expands a modified file node
- **THEN** the system displays the file's unified diff hunks
- **AND** added/removed/context lines are visually distinguishable

### Requirement: Commit message is mandatory
The system SHALL require a non-empty commit message before allowing commit submission.

#### Scenario: Empty message
- **WHEN** the commit message is empty or whitespace-only
- **THEN** Commit & Push is disabled
- **AND** an inline validation message is shown when user attempts submission

### Requirement: Selective apply controls final commit
The system SHALL apply only selected files/statuses during patch application.

#### Scenario: Commit selected subset
- **WHEN** the user submits commit with selected paths
- **THEN** only selected files are applied to upstream before commit
- **AND** unselected files are excluded from that commit

#### Scenario: Status-based selection
- **WHEN** the user chooses status filters (Added/Modified/Deleted)
- **THEN** only files matching enabled statuses are selected by default
- **AND** user can override per file or directory

### Requirement: Binary file diffs use metadata-only preview
The system SHALL treat binary file changes as selectable file-level changes while rendering metadata-only previews.

#### Scenario: Binary file appears in preview
- **WHEN** a pending change targets a binary file
- **THEN** the file appears in the tree with its file-level status
- **AND** the preview displays a metadata message (for example, "Binary file changed")
- **AND** no line-by-line hunk content is rendered

#### Scenario: Selective apply includes binary file
- **WHEN** the user selects a binary file for commit
- **THEN** the system applies the binary change as a whole file operation
- **AND** the system does not attempt partial/hunk-level application for that file

#### Scenario: Unselected binary file remains excluded
- **WHEN** the user leaves a binary file unselected
- **THEN** the binary change is excluded from patch application for that commit

#### Scenario: Unsupported binary patch format
- **WHEN** preview parsing cannot decode binary internals for a file
- **THEN** the system falls back to metadata-only preview for that file
- **AND** the file remains selectable
- **AND** commit flow is not blocked solely by preview rendering limitations
