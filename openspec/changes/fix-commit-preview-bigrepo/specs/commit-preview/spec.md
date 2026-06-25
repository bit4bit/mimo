## ADDED Requirements

### Requirement: Commit preview reflects the upstream-to-workspace delta

The commit preview SHALL report the set of changes that committing would introduce upstream — the two-endpoint delta between the upstream checkout and the agent workspace. It MUST NOT be derived from a single checkout's status relative to its own baseline.

#### Scenario: Workspace adds and modifies files

- **WHEN** the agent workspace contains a new file and a file whose content differs from the upstream copy
- **THEN** the preview lists the new file with status `added` and the differing file with status `modified`

#### Scenario: File deleted in workspace

- **WHEN** a file exists in the upstream checkout but not in the agent workspace
- **THEN** the preview lists it with status `deleted`

#### Scenario: Already-committed file no longer appears as pending

- **WHEN** a file was selectively committed (copied to upstream and committed) so its content is now identical in the upstream checkout and the agent workspace
- **THEN** the preview does not list that file, even though the agent workspace still differs from its own VCS baseline

#### Scenario: No changes

- **WHEN** the upstream checkout and the agent workspace contain identical tracked content
- **THEN** the preview reports an empty file list and a zeroed summary

### Requirement: Commit preview is independent of the VCS backend

The commit preview SHALL be computed by comparing the two working directories directly, without invoking a version-control backend. It MUST produce identical results regardless of whether the session repository type is `git` or `fossil`, and the domain code MUST NOT gain a direct dependency on git.

#### Scenario: Identical behavior across backends

- **WHEN** the same upstream and workspace contents are previewed for a `git` session and for a `fossil` session
- **THEN** both previews report the same file list, statuses, and summary

### Requirement: Commit preview excludes version-control internals and policy-excluded paths

The commit preview SHALL skip every path covered by the centralized exclusion policy (`.git`, `_FOSSIL_`, `.fossil*`, `node_modules`, and the other entries in `EXCLUDED_PATHS`) while comparing the two trees. Excluded paths MUST NOT be traversed, read, or surfaced as changes.

#### Scenario: VCS metadata is never surfaced

- **WHEN** the upstream checkout contains a `.git` directory and the workspace does not
- **THEN** the preview lists no `.git/*` entries and does not read or encode any `.git` content

#### Scenario: Dependency directories are skipped

- **WHEN** either tree contains a `node_modules` directory
- **THEN** no `node_modules/*` path appears in the preview file list and the directory is not traversed

### Requirement: Commit preview scales with repository size

The commit preview SHALL classify files by size first: a path present on only one side is `added`/`deleted`, and a path present on both sides with differing size is `modified` — none of these require reading file content. Content SHALL be read only to disambiguate paths that exist on both sides with equal size, and that comparison SHALL stop at the first differing byte. Generating the preview MUST NOT traverse version-control internals and MUST NOT build a whole-repository binary patch.

#### Scenario: One change among many unchanged files

- **WHEN** the workspace and upstream share a large number of files and exactly one file differs
- **THEN** the preview returns promptly and lists only the one changed file

#### Scenario: Added, deleted, and size-differing files need no content reads

- **WHEN** a file exists on only one side, or exists on both sides with differing size
- **THEN** its status is determined from existence and size alone, without reading its content

### Requirement: Per-file diff hunks are fetched on demand

The commit preview's initial response SHALL contain only the file list and summary, not diff hunks. Diff hunks for a file SHALL be computed only when that file is requested, reading content solely for the requested file.

#### Scenario: Expanding a file loads its hunks

- **WHEN** a user expands a single changed file in the preview
- **THEN** the system returns the diff hunks for that file without reading the content of other changed files

#### Scenario: Initial preview omits hunks

- **WHEN** the preview file list is first returned
- **THEN** no diff hunks are included in that response
