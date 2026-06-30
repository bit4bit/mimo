## MODIFIED Requirements

### Requirement: Commit preview reflects the upstream-to-workspace delta

The commit preview SHALL report the set of changes that committing would introduce upstream — the two-endpoint delta between the current upstream state and the agent's work. It SHALL be computed as a git commit-range diff in the agent workspace, `git diff <baseline>..HEAD`, where `<baseline>` is the persisted per-session ref representing current upstream state (initialized to the seeded "Initial import" commit). It MUST NOT be derived from a single checkout's status relative to its own baseline, and it no longer requires a second `upstream/` working tree as a diff endpoint.

#### Scenario: Workspace adds and modifies files

- **WHEN** the agent's commits since `<baseline>` add a new file and modify an existing file
- **THEN** the preview lists the new file with status `added` and the modified file with status `modified`

#### Scenario: File deleted in workspace

- **WHEN** the agent's commits since `<baseline>` delete a file present at `<baseline>`
- **THEN** the preview lists it with status `deleted`

#### Scenario: Already-committed file no longer appears as pending

- **WHEN** a file was selectively committed (applied to the upstream checkout and committed) and `<baseline>` was advanced to reflect that
- **THEN** the preview does not list that file, even though the agent workspace HEAD is unchanged

#### Scenario: No changes

- **WHEN** the agent workspace HEAD equals `<baseline>`
- **THEN** the preview reports an empty file list and a zeroed summary

### Requirement: Commit preview is independent of the VCS backend

The commit preview SHALL produce identical results regardless of whether the session's upstream repository type is `git` or `fossil`. It is computed from the agent workspace's git history, which exists for every repo type because fossil upstreams are funneled through `fossil import --git` and a git bare seed. Fossil-specific logic is confined to the upstream-persist (`commit`/`push`) step and is not part of computing the preview.

#### Scenario: Identical behavior across backends

- **WHEN** equivalent agent changes are previewed for a `git` upstream session and for a `fossil` upstream session
- **THEN** both previews report the same file list, statuses, and summary

### Requirement: Commit preview scales with the number of changed files

The commit preview SHALL be computed from git's object store (`git diff --name-status <baseline>..HEAD`) so its cost scales with the number of changed files, not with repository or history size. Generating the preview MUST NOT `stat`-walk the entire working tree, MUST NOT read the content of unchanged files, MUST NOT traverse version-control internals, and MUST NOT build a whole-repository binary patch.

#### Scenario: One change among many unchanged files

- **WHEN** the repository has a large number of files and exactly one file differs since `<baseline>`
- **THEN** the preview returns promptly and lists only the one changed file, without walking or reading unchanged files

#### Scenario: VCS internals and ignored paths are never surfaced

- **WHEN** the working tree contains `.git` internals and git-ignored paths
- **THEN** the preview lists none of them (git's own tracking and ignore rules apply natively)

### Requirement: Per-file diff hunks are fetched on demand

The commit preview's initial response SHALL contain only the file list and summary, not diff hunks. Diff hunks for a file SHALL be computed only when that file is requested, from the git commit range for that path (`git diff <baseline>..HEAD -- <path>`, with the before-bytes available via `git show <baseline>:<path>`), reading only the requested file.

#### Scenario: Expanding a file loads its hunks

- **WHEN** a user expands a single changed file in the preview
- **THEN** the system returns the diff hunks for that file from the git range, without reading the content of other changed files

#### Scenario: Initial preview omits hunks

- **WHEN** the preview file list is first returned
- **THEN** no diff hunks are included in that response
