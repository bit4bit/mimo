## MODIFIED Requirements

### Requirement: CommitBuffer renders the flat changed-file list

The system SHALL render a flat list of changed files across all session repositories, grouped or filterable by repository, using repo-qualified file identities.

#### Scenario: Render modified file

- **GIVEN** preview returns one file `{ repoId: "backend", path: "src/foo.ts", status: "modified" }`
- **WHEN** the Commit buffer is active
- **THEN** a row for `backend:src/foo.ts` is rendered with an unchecked checkbox
- **AND** the row shows status `modified`
- **AND** the row exposes a control that opens the repo-qualified file in the Patches buffer

#### Scenario: Row click navigates to Patches buffer

- **WHEN** the user activates the patch-view control on a changed-file row
- **THEN** the patch buffer is opened with the file `repoId` and repo-relative `path`
- **AND** the Commit buffer's message and selection are retained in module state

### Requirement: Commit & Push action lives inside the buffer

The system SHALL provide a Commit & Push button inside the Commit buffer footer that posts the selected repo-qualified paths and one message to `POST /commits/:sessionId/commit-and-push`.

#### Scenario: Commit with selected files and message

- **GIVEN** the user has checked files in repositories "backend" and "frontend" and typed message "fix: null"
- **WHEN** the user clicks Commit & Push
- **THEN** a `POST /commits/:sessionId/commit-and-push` request is issued with the selected repo-qualified paths and the message
- **AND** the response shows per-repository committed, skipped, or failed results
- **AND** on full success the commit message and selection are cleared

#### Scenario: Commit with partial repository failure

- **GIVEN** the user commits selected files in repositories "backend" and "frontend"
- **WHEN** the backend push fails and the frontend commit succeeds
- **THEN** the Commit buffer shows backend as failed with error details
- **AND** shows frontend as committed
- **AND** offers retry or force-push recovery for the failed repository

### Requirement: Sync Now and Force Push live inside the buffer

The system SHALL provide Sync Now and Force Push actions inside the Commit buffer footer. Force Push SHALL operate per repository when a session contains multiple repositories.

#### Scenario: Sync Now

- **WHEN** the user clicks Sync Now inside the Commit buffer
- **THEN** a sync request is issued for the session
- **AND** the result is shown per repository where applicable

#### Scenario: Force Push one repository

- **WHEN** the user clicks Force Push for repository "backend" inside the Commit buffer
- **THEN** a force-push request is issued for that session repository
- **AND** the result is shown in the Commit buffer status
