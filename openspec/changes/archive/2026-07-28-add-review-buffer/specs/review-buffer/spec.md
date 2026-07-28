## ADDED Requirements

### Requirement: Review buffer registration

The system SHALL register a buffer with id `review`, name `Review`, in the `left` frame, positioned immediately after the `commit` buffer in `buffers/index.ts`.

#### Scenario: Review tab appears after Commit

- **WHEN** the session page loads with default buffers registered
- - **THEN** the left-frame tab bar SHALL show a `Review` tab positioned immediately after the `Commit` tab

#### Scenario: Existing frame state preserved

- **WHEN** a session with persisted frame state (`leftFrame.activeBufferId = "chat"`) loads
- **THEN** the Chat buffer SHALL remain active and the `Review` tab SHALL be present but inactive

### Requirement: Review buffer shows a horizontal split of changed-file tree and unified diff

The Review buffer SHALL render an internal horizontal split: a tree of only changed files on the left pane and a unified diff of the selected file on the right pane. A summary header above the split SHALL display the added, modified, and deleted file counts.

#### Scenario: Split layout renders on first activation

- **WHEN** the Review buffer becomes active and the review diff response contains changed files
- **THEN** the buffer SHALL render a file tree in the left pane and an empty-state message ("Select a file to view its diff") in the right pane
- **AND** the summary header SHALL display the counts of added, modified, and deleted files

#### Scenario: Compare bar shows the GitHub-style base and current refs

- **WHEN** the Review buffer renders
- **THEN** a compare bar SHALL show the initial project-branch state as the base ref and the current session branch as the current ref
- **AND** when branch names are unavailable it SHALL fall back to `initial` and `current`

#### Scenario: Empty diff state

- **WHEN** the Review buffer is active and the review diff response contains an empty `files` array
- **THEN** both panes SHALL display an empty-state message ("No changes in this session yet")
- **AND** the summary header SHALL display zero counts for added, modified, and deleted

#### Scenario: Compact tree pane leaves width for the diff

- **WHEN** the Review buffer renders its horizontal split
- **THEN** the left changed-file tree pane SHALL use a compact fixed width (260px, within a 180px–320px range) instead of a large percentage of the buffer
- **AND** each tree depth SHALL add only one space (`1ch`) of indentation so deep paths do not consume excessive horizontal space
- **AND** tree row chrome (toggle, spacer, gaps, and status badge) SHALL be compact so child rows do not push content unnecessarily to the right

### Requirement: Changed-file tree includes added, modified, and deleted files

The file tree SHALL include every file from the review diff response, grouped by directory, with status badges: `+` (green) for added, `~` (blue) for modified, `-` (red) for deleted. Deleted files SHALL appear as leaf nodes despite not existing in the working tree.

#### Scenario: Added file shown with green badge

- **WHEN** a file with `status: "added"` is present in the review diff response
- **THEN** the tree node for that file SHALL display a `+` badge styled with `file-status--added` (green) alongside the filename

#### Scenario: Modified file shown with blue badge

- **WHEN** a file with `status: "modified"` is present in the review diff response
- **THEN** the tree node for that file SHALL display a `~` badge styled with `file-status--modified` (blue) alongside the filename

#### Scenario: Deleted file shown with red badge

- **WHEN** a file with `status: "deleted"` is present in the review diff response
- **THEN** the tree node for that file SHALL display a `-` badge styled with `file-status--deleted` (red) alongside the filename
- **AND** the node SHALL be selectable (clicking it SHALL show its removal diff)

#### Scenario: Directories collapsed by default

- **WHEN** the tree is rendered
- **THEN** every directory node SHALL start in the collapsed state and no child contents SHALL be visible until the user expands the directory

#### Scenario: Auto-expand ancestors of changed files

- **WHEN** the tree renders with a changed file at path `src/auth/session.ts`
- **THEN** the directories `src/` and `src/auth/` SHALL be expanded
- **AND** the changed-file leaf SHALL be visible
- **AND** sibling directories with no changed descendants SHALL remain collapsed

#### Scenario: Folder expand/collapse toggles children

- **WHEN** the user clicks a collapsed directory node
- **THEN** its direct children SHALL become visible
- **AND WHEN** the user clicks an expanded directory node
- **THEN** its children SHALL become hidden

### Requirement: Unified diff pane renders the selected file's diff

Selecting a file in the tree SHALL fetch and render the unified diff for that file in the right pane, with `+`/`-` line highlighting and the diff-navigation overview track. Binary files SHALL render a "Binary file changed" placeholder.

#### Scenario: Selecting a modified file renders its diff

- **WHEN** the user clicks a file leaf with `status: "modified"`
- **THEN** the right pane SHALL fetch `GET /api/sessions/:sessionId/review/files/<path>`
- **AND** SHALL render the returned hunks with `.diff-line--added`, `.diff-line--removed`, and `.diff-line--context` classes
- **AND** SHALL render the diff-navigation overview track with the change counter

#### Scenario: Selecting an added file renders its diff

- **WHEN** the user clicks a file leaf with `status: "added"`
- **THEN** the right pane SHALL fetch and render the diff, which SHALL show all lines as additions

#### Scenario: Selecting a deleted file renders its removal diff

- **WHEN** the user clicks a file leaf with `status: "deleted"`
- **THEN** the right pane SHALL fetch and render the diff, which SHALL show all lines as removals

#### Scenario: Binary file placeholder

- **WHEN** the selected file's diff response has `isBinary: true`
- **THEN** the right pane SHALL render a "Binary file changed" placeholder and SHALL NOT attempt to render hunks

#### Scenario: No file selected

- **WHEN** no file is selected in the tree
- **THEN** the right pane SHALL display "Select a file to view its diff"

### Requirement: Manual refresh only

The Review buffer SHALL refresh its file list and per-file diffs only when the user clicks the Refresh button. The buffer SHALL NOT poll, SHALL NOT subscribe to websocket updates, and SHALL NOT re-fetch on buffer activation.

#### Scenario: Manual refresh re-fetches the file list

- **WHEN** the user clicks the Refresh button
- **THEN** the buffer SHALL issue `GET /api/sessions/:sessionId/review`
- **AND** SHALL rebuild and re-render the tree from the new response
- **AND** SHALL clear the currently selected file (right pane returns to empty state)

#### Scenario: No refresh on activation

- **WHEN** the buffer transitions from inactive to active (another left-frame tab was active and the user switches to Review)
- **THEN** the buffer SHALL NOT issue any review requests
- **AND** SHALL display the previously rendered tree (if any)

#### Scenario: No polling

- **WHEN** the buffer remains active for an extended period
- **THEN** the buffer SHALL NOT issue periodic refresh requests

### Requirement: Review diff sourced from git root-commit..HEAD

The review diff SHALL be computed as `git diff <root-commit>..HEAD` in the agent workspace, where the root commit is the commit with no parents (the seeded base commit), resolved on demand via `git rev-list --max-parents=0 HEAD`. The review diff SHALL NOT use the session's `baseline` ref.

#### Scenario: Root commit resolved independently of baseline

- **WHEN** a session has a `baseline` ref that has been advanced by a selective commit
- **AND** the Review buffer fetches the review diff
- **THEN** the file list SHALL include all files changed between the root commit (not `baseline`) and HEAD
- **AND** files that were selectively committed (and thus dropped from the commit preview) SHALL still appear in the review diff

#### Scenario: Session with no commits since seed

- **WHEN** the agent workspace has no commits beyond the seeded root commit
- **THEN** the review diff SHALL return an empty `files` array
- **AND** the summary SHALL report zero added, modified, and deleted

### Requirement: Review REST endpoints

The system SHALL expose two REST endpoints for the review diff.

#### Scenario: GET review file list

- **WHEN** a request is made to `GET /api/sessions/:sessionId/review`
- **THEN** the endpoint SHALL resolve the session's agent workspace path
- **AND** SHALL resolve the root commit via `git rev-list --max-parents=0 HEAD`
- **AND** SHALL return `{ files: [{path, status}], summary: {added, modified, deleted} }` with status 200
- **AND** each file's `status` SHALL be `"added"`, `"modified"`, or `"deleted"`

#### Scenario: GET review per-file diff

- **WHEN** a request is made to `GET /api/sessions/:sessionId/review/files/<path>` where `<path>` may contain slashes
- **THEN** the endpoint SHALL resolve the root commit and compute `git diff <root>..HEAD -- <path>`
- **AND** SHALL return `{ hunks: DiffHunk[], isBinary: boolean }` with status 200

#### Scenario: Session not found

- **WHEN** the session id does not resolve to a workspace path
- **THEN** both endpoints SHALL return status 404 with `{ error: "Session not found" }`

#### Scenario: File not in diff

- **WHEN** a request is made to `GET /api/sessions/:sessionId/review/files/<path>` and the path is not in the root..HEAD diff
- **THEN** the endpoint SHALL return status 404 with `{ error: "File not found in review diff" }`