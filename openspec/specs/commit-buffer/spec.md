# Specification: CommitBuffer

## Purpose

The CommitBuffer is the commit review surface, rendered as a first-class left-frame buffer (id `"commit"`, immediately after the `patches` buffer). It replaces the former commit modal and the three session-footer action buttons (`Commit`, `Sync Now`, `Force Push`), consolidating the changed-file list, commit message, and all commit-related actions into a single buffer whose in-progress state persists across buffer switches.

## Requirements

### Requirement: CommitBuffer is registered as a left-frame buffer next to Patches

The system SHALL register a buffer with `id: "commit"`, display name "Commit", in the left frame, positioned immediately after the `patches` buffer in `ensureDefaultBuffersRegistered()`.

#### Scenario: Buffer tab order in the left frame

- **WHEN** the session detail page renders
- **THEN** the left frame buffer tabs appear in order: Chat, Edit, Patches, Commit
- **AND** the Commit tab is selectable via `switchFrameBuffer("left","commit")`

#### Scenario: No commit modal exists

- **WHEN** the session detail page renders
- **THEN** there is no `#commit-dialog` element in the DOM
- **AND** there are no `#commit-btn`, `#sync-now-btn`, or `#force-push-btn` elements in the footer bar

### Requirement: CommitBuffer lazily fetches preview on first activation

The system SHALL fetch the commit preview from `GET /commits/:sessionId/preview` only on the first activation of the CommitBuffer for a given session, not on page load.

#### Scenario: First switch to Commit buffer

- **GIVEN** the user has not yet activated the Commit buffer this session
- **WHEN** the user switches to the Commit buffer
- **THEN** a request to `GET /commits/:sessionId/preview` is issued
- **AND** the returned file list is rendered in the buffer

#### Scenario: Re-activation does not re-fetch

- **GIVEN** the Commit buffer was previously activated and preview was fetched
- **WHEN** the user switches away and back to the Commit buffer
- **THEN** no preview request is issued
- **AND** the previously-rendered file list is still displayed

#### Scenario: Manual refresh

- **WHEN** the user clicks the Refresh button inside the Commit buffer
- **THEN** a fresh `GET /commits/:sessionId/preview` request is issued
- **AND** the file list is replaced with the new result

### Requirement: Commit message persists across buffer switches

The system SHALL retain the in-progress commit message in module state so that switching away from and back to the Commit buffer preserves the typed text.

#### Scenario: Type message, switch away, switch back

- **GIVEN** the user has typed "fix: handle null" into the commit message textarea
- **WHEN** the user switches to the Patches buffer
- **AND** then switches back to the Commit buffer
- **THEN** the commit message textarea still contains "fix: handle null"

#### Scenario: Successful commit clears the message

- **WHEN** the user submits a commit with message "fix: handle null" and the commit succeeds
- **THEN** the commit message textarea is cleared
- **AND** the module-state message is reset to empty

### Requirement: CommitBuffer renders the flat changed-file list

The system SHALL render a flat list of changed files (not a tree) using the shared `renderChangedFileRow` helper, with a checkbox, status, and a per-row action that opens the file in the Patches buffer.

#### Scenario: Render modified file

- **GIVEN** preview returns one file `src/foo.ts` with status `modified`
- **WHEN** the Commit buffer is active
- **THEN** a row for `src/foo.ts` is rendered with an unchecked checkbox
- **AND** the row shows status `modified`
- **AND** the row exposes a control that, when activated, calls `openFileInPatchBuffer("src/foo.ts", ...)`

#### Scenario: Row click navigates to Patches buffer

- **WHEN** the user activates the patch-view control on the `src/foo.ts` row
- **THEN** `openFileInPatchBuffer` is invoked
- **AND** `switchFrameBuffer("left","patches")` is called
- **AND** the Commit buffer's message and selection are retained in module state

### Requirement: Commit & Push action lives inside the buffer

The system SHALL provide a Commit & Push button inside the Commit buffer footer that posts the selected paths and message to `POST /commits/:sessionId/commit-and-push`.

#### Scenario: Commit with selected files and message

- **GIVEN** the user has checked `src/foo.ts` and typed message "fix: null"
- **WHEN** the user clicks Commit & Push
- **THEN** a `POST /commits/:sessionId/commit-and-push` request is issued with the selected paths and the message
- **AND** on success the `#commit-status` shows a success message
- **AND** the commit message and selection are cleared

#### Scenario: Commit with no files selected

- **GIVEN** no files are checked
- **WHEN** the user clicks Commit & Push
- **THEN** no request is issued
- **AND** the `#commit-status` shows an error indicating at least one file must be selected

### Requirement: Sync Now and Force Push live inside the buffer

The system SHALL provide Sync Now and Force Push buttons inside the Commit buffer footer, relocated from the session footer bar, posting to their existing REST routes.

#### Scenario: Sync Now

- **WHEN** the user clicks Sync Now inside the Commit buffer
- **THEN** a `POST /sessions/:sessionId/sync` request is issued
- **AND** the result is shown in `#commit-status`

#### Scenario: Force Push

- **WHEN** the user clicks Force Push inside the Commit buffer
- **THEN** a `POST /commits/:sessionId/push-force` request is issued
- **AND** the result is shown in `#commit-status`

### Requirement: Keybinding opens the buffer instead of a modal

The system SHALL route the commit keybinding to `switchFrameBuffer("left","commit")` rather than opening a modal.

#### Scenario: Press the commit keybinding

- **WHEN** the user presses the keybinding previously bound to opening the commit modal
- **THEN** `switchFrameBuffer("left","commit")` is called
- **AND** the Commit buffer becomes active

### Requirement: Escape switches away from the Commit buffer

The system SHALL, when the Commit buffer is active and the user presses Escape, switch back to the previously-active left-frame buffer rather than closing a modal.

#### Scenario: Escape from Commit buffer

- **GIVEN** the Commit buffer is active and the previously-active left-frame buffer was Patches
- **WHEN** the user presses Escape
- **THEN** `switchFrameBuffer("left","patches")` is called
- **AND** the Commit buffer's message and selection are retained

#### Scenario: Escape when Commit buffer is not active

- **GIVEN** some other buffer is active
- **WHEN** the user presses Escape
- **THEN** the existing Escape behavior for that buffer applies (unchanged)

### Requirement: Change navigation works while Commit buffer is active

The system SHALL allow the up/down change-navigation keybinding to move between changed-file rows while the Commit buffer is active, using the `MIMO_COMMIT_BUFFER.navigateChange` hook.

#### Scenario: Navigate down through changes

- **GIVEN** the Commit buffer is active and the preview contains three files
- **WHEN** the user presses the down-arrow change-navigation key
- **THEN** the next file row is highlighted
- **AND** `MIMO_COMMIT_BUFFER.navigateChange` is invoked

#### Scenario: Change navigation is gated on Commit buffer active

- **GIVEN** the Chat buffer is active
- **WHEN** the user presses the change-navigation key
- **THEN** `MIMO_COMMIT_BUFFER.navigateChange` is not invoked
- **AND** the key falls through to normal Chat behavior