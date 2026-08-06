## MODIFIED Requirements

### Requirement: Review buffer shows a horizontal split of changed-file tree and unified diff

The Review buffer SHALL render an internal horizontal split with a repository-aware changed-file tree on the left pane and a unified diff of the selected repo-qualified file on the right pane. A summary header above the split SHALL display added, modified, and deleted counts across all repositories or for the selected repository.

#### Scenario: Split layout renders on first activation

- **WHEN** the Review buffer becomes active and the review diff response contains changed files
- **THEN** the buffer renders a repository-aware file tree in the left pane and an empty-state message in the right pane
- **AND** the summary header displays added, modified, and deleted counts

#### Scenario: Repository selector filters changed files

- **WHEN** the user selects repository "backend" in the Review buffer
- **THEN** the changed-file tree shows only files from that repository
- **AND** selecting "All repositories" shows the aggregate tree grouped by repository

### Requirement: Review diff sourced from git root-commit..HEAD

For each session repository, the review diff SHALL be computed as `git diff <root-commit>..HEAD` in that repository agent workspace checkout, where the root commit is resolved on demand via `git rev-list --max-parents=0 HEAD`. The review diff SHALL NOT use the session repository baseline ref.

#### Scenario: Root commit resolved independently of baseline

- **WHEN** a session repository has a baseline ref that has been advanced by a selective commit
- **AND** the Review buffer fetches the review diff for that repository
- **THEN** the file list includes all files changed between the repository root commit and HEAD
- **AND** files that were selectively committed still appear in the review diff

### Requirement: Review REST endpoints

The system SHALL expose REST endpoints for repo-qualified review diffs.

#### Scenario: GET review file list

- **WHEN** a request is made to `GET /api/sessions/:sessionId/review`
- **THEN** the endpoint returns repo-qualified files as `{ files: [{repoId, path, status}], summary: {added, modified, deleted} }`
- **AND** each file status is `"added"`, `"modified"`, or `"deleted"`

#### Scenario: GET review per-file diff

- **WHEN** a request is made to `GET /api/sessions/:sessionId/review/files/<repoId>/<path>` where `<path>` may contain slashes
- **THEN** the endpoint resolves that repository root commit and computes `git diff <root>..HEAD -- <path>`
- **AND** returns `{ hunks: DiffHunk[], isBinary: boolean }` with status 200
