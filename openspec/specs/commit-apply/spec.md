# commit-apply Specification

## Purpose
TBD - created by archiving change fix-commit-push-bigrepo. Update Purpose after archive.
## Requirements
### Requirement: Committing selected files scales with repository size

Applying and committing a user-selected subset of changes SHALL obtain its changed-file set without building a whole-repository patch and without traversing version-control internals. The changed-file set MUST be derived from the same filesystem comparison used by the commit preview (the `upstream → agent-workspace` stat-first delta, reusing the persisted manifest and the shared changed-files cache when warm), not from `git diff --no-index --binary`.

#### Scenario: One change among many unchanged files commits promptly

- **WHEN** the agent workspace differs from the upstream checkout in exactly one file among many unchanged files, and the user commits that file
- **THEN** the commit completes promptly, copying only the changed file to the upstream checkout, without reading or encoding the content of unchanged files

#### Scenario: VCS internals are never walked or encoded during commit

- **WHEN** the upstream checkout contains a `.git` (or `_FOSSIL_`/`.fossil*`) directory and the user commits selected files
- **THEN** no `.git`/excluded path is traversed, read, or base85-encoded, and no whole-repository binary patch is generated

### Requirement: Selective commit preserves two-endpoint semantics

Committing a selected subset SHALL copy exactly the selected paths from the agent workspace to the upstream checkout (deleting selected paths absent from the workspace), commit them on the upstream checkout, and push, leaving unselected changes pending. A path already committed upstream MUST NOT reappear in a subsequent preview.

#### Scenario: Only selected files are committed

- **WHEN** the changed set is three files and the user selects one
- **THEN** only that file is copied to the upstream checkout and committed, and the other two remain listed as pending in the next preview

#### Scenario: Status filtering is honored

- **WHEN** the user restricts the commit to a subset of statuses (added / modified / deleted)
- **THEN** only changed files matching the selected statuses are eligible to be committed

### Requirement: Change detection for the commit path is independent of the VCS backend

The changed-file detection used by the commit path SHALL be computed by comparing the upstream checkout and the agent workspace directly, producing identical results for `git` and `fossil` session repositories, without adding a direct git dependency to the commit domain. The git/fossil `commit` and `push` steps that persist the change to the upstream checkout remain backend-specific and unchanged.

#### Scenario: Identical detection across backends

- **WHEN** the same upstream and workspace contents are committed for a `git` session and for a `fossil` session
- **THEN** the changed-file set used to drive the commit is identical, and only the backend-specific `commit`/`push` step differs

