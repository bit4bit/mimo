## ADDED Requirements

### Requirement: FileTree buffer registration
The system SHALL register a buffer with id `file-tree`, name `Files`, in the `right` frame, ordered immediately after the `notes` buffer in `buffers/index.ts`.

#### Scenario: FileTree tab appears after Notes
- **WHEN** the session page loads with default buffers registered
- **THEN** the right-frame tab bar SHALL show a `Files` tab positioned immediately after the `Notes` tab

#### Scenario: Existing frame state preserved
- **WHEN** a session with persisted frame state (`rightFrame.activeBufferId = "notes"`) loads
- **THEN** the Notes buffer SHALL remain active and the `Files` tab SHALL be present but inactive

### Requirement: Collapsible directory tree of the workspace
The FileTree buffer SHALL render the session workspace as a nested directory tree built client-side from the flat `GET /api/sessions/:sessionId/files` list.

#### Scenario: Tree built from flat file list
- **WHEN** the FileTree buffer becomes active and the flat file list loads
- **THEN** the buffer SHALL group files by `/`-delimited path segments into nested directories and render each directory as a collapsible node and each file as a leaf node

#### Scenario: Directories collapsed by default
- **WHEN** the tree is rendered and no changed files exist
- **THEN** every directory node SHALL start in the collapsed state and no child contents SHALL be visible until the user expands the directory

#### Scenario: Folder expand/collapse toggles children
- **WHEN** the user clicks a collapsed directory node
- **THEN** its direct children SHALL become visible
- **AND WHEN** the user clicks an expanded directory node
- **THEN** its children SHALL become hidden

### Requirement: Auto-expand ancestors of changed files
On initial render (and on each lazy refresh), the tree SHALL auto-expand exactly the ancestor directories of each changed file so changed-file highlights are visible without user interaction, while leaving all other directories collapsed.

#### Scenario: Changed file ancestors expand
- **WHEN** the tree renders with a changed file at path `src/domain/files/changed-files.ts`
- **THEN** the directories `src/`, `src/domain/`, and `src/domain/files/` SHALL be expanded
- **AND** the changed-file leaf SHALL be visible
- **AND** sibling directories of each ancestor with no changed descendants SHALL remain collapsed

#### Scenario: No changed files leaves all dirs collapsed
- **WHEN** the changed-files response contains an empty `files` array
- **THEN** no directory SHALL be auto-expanded

### Requirement: Highlight changed files
The FileTree buffer SHALL highlight files whose status is `added` or `modified` using the existing `FILE_STATUS_META` styling (`+` green for added, `~` blue for modified) and SHALL NOT render deleted files.

#### Scenario: Added file shown with green badge
- **WHEN** a file with `status: "added"` is present in the changed-files response
- **THEN** the tree node for that file SHALL display a `+` badge styled with `file-status-new` (green) alongside the filename

#### Scenario: Modified file shown with blue badge
- **WHEN** a file with `status: "modified"` is present in the changed-files response
- **THEN** the tree node for that file SHALL display a `~` badge styled with `file-status-changed` (blue) alongside the filename

#### Scenario: Deleted files omitted
- **WHEN** a file with `status: "deleted"` appears in the changed-files response
- **THEN** the tree SHALL NOT render any node for that path

### Requirement: Click to open file in existing buffer
Clicking a file leaf node SHALL open the file via the existing entry points and switch focus to the left frame, matching `utils.js:renderChangedFileRow` behavior.

#### Scenario: Clicking an added file opens Edit buffer
- **WHEN** the user clicks a file leaf whose changed status is `added`
- **THEN** the system SHALL call `window.EditBuffer.openFile(path)`
- **AND** SHALL switch the left frame to the `edit` buffer

#### Scenario: Clicking a modified file opens Patch buffer
- **WHEN** the user clicks a file leaf whose changed status is `modified`
- **THEN** the system SHALL call `openFileInPatchBuffer(path, sessionId)`
- **AND** the left frame SHALL switch to the `patches` buffer

#### Scenario: Clicking an unchanged file opens Edit buffer
- **WHEN** the user clicks a file leaf that is not present in the changed-files response
- **THEN** the system SHALL call `window.EditBuffer.openFile(path)`
- **AND** SHALL switch the left frame to the `edit` buffer

### Requirement: Lazy refresh on buffer activation
The FileTree buffer SHALL refresh its file list and changed-files list from the server only when the buffer transitions from inactive to active, and SHALL NOT poll or subscribe to websocket updates.

#### Scenario: Refresh on activation
- **WHEN** the buffer's `isActive` prop transitions from `false` to `true`
- **THEN** the buffer SHALL issue parallel requests to `GET /api/sessions/:sessionId/files` and `GET /api/sessions/:sessionId/changed-files`
- **AND** SHALL rebuild the tree once both responses resolve

#### Scenario: No refresh while inactive
- **WHEN** the buffer is inactive (another right-frame tab is active)
- **THEN** the buffer SHALL NOT issue any file or changed-files requests

#### Scenario: No polling
- **WHEN** the buffer remains active for an extended period
- **THEN** the buffer SHALL NOT issue periodic refresh requests

### Requirement: Changed-files REST endpoint
The system SHALL expose `GET /api/sessions/:sessionId/changed-files` returning the result of `detectChangedFiles` (reusing `ChangedFilesCache`) for the session's upstream and workspace paths.

#### Scenario: Successful response with cache hit
- **WHEN** a request is made and `ChangedFilesCache` has an entry for `(sessionId, upstreamPath, workspacePath)`
- **THEN** the endpoint SHALL return the cached result as `{ files: [{path, status, size}], summary: {added, modified, deleted} }` with status 200
- **AND** SHALL NOT invoke `detectChangedFiles`

#### Scenario: Successful response with cache miss
- **WHEN** a request is made and `ChangedFilesCache` has no entry
- **THEN** the endpoint SHALL invoke `detectChangedFiles` with a manifest store (mirroring the Impact calculator wiring)
- **AND** SHALL store the result in `ChangedFilesCache`
- **AND** SHALL return the result with status 200

#### Scenario: Session not found
- **WHEN** the session id does not resolve to a workspace path
- **THEN** the endpoint SHALL return status 404 with `{ error: "Session not found" }`