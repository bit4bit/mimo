## ADDED Requirements

### Requirement: Impact change detection scales with the number of changed files

The impact buffer's changed-file set SHALL be sourced from the same git commit-range diff used by the commit preview (`git diff --name-status <baseline>..HEAD` in the agent workspace), reusing the shared changed-files cache when warm. It MUST NOT perform an independent two-tree filesystem scan and MUST NOT block the event loop with synchronous filesystem calls while enumerating changed files.

#### Scenario: Impact changed-files render promptly on a large repository

- **WHEN** the impact buffer is computed for a large repository in which only a few files changed since `<baseline>`
- **THEN** the changed-file set is obtained from git in time proportional to the number of changed files, without scanning the whole tree, and the impact buffer's changed files render without minutes-long delay

#### Scenario: Impact reuses the preview's changed-file set

- **WHEN** a commit preview has just populated the shared changed-files cache for a session
- **THEN** the impact calculation reuses that set instead of recomputing the delta

### Requirement: Impact metrics are computed only for changed files

Source-metric computation (line counts, complexity, duplication, dependency parsing) SHALL run only on the files reported as changed by the git-range delta, not on the entire repository.

#### Scenario: Metrics scoped to changed files

- **WHEN** the impact buffer computes metrics for a change touching a small subset of files
- **THEN** metric subprocesses are invoked only for those changed files, and unchanged files are not measured
