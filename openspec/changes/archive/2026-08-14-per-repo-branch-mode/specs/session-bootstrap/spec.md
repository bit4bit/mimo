## MODIFIED Requirements

### Requirement: Session creation supports branch mode selection

The system SHALL accept, for each repository of the project, a branch mode (`branchMode_<repoId>` = `new` | `sync`) and branch name (`branchName_<repoId>`) on session creation, declaring per repository whether the branch is created locally from the project default or synced from an existing remote branch. The system SHALL resolve mode and name independently per repository and persist only the resolved branch per repository.

#### Scenario: Create new branch per repository (default)

- **WHEN** a user submits the new-session form with `branchName_<repoId>=feature/foo` and `branchMode_<repoId>=new` (or omits the mode) for a repository
- **THEN** the system clones that repository's `sourceBranch` into the session upstream directory
- **AND** the system creates `feature/foo` locally via the VCS `createBranch` operation for that repository
- **AND** the system persists the repository's session branch as `feature/foo` so the commit/push path targets it

#### Scenario: Sync existing remote branch per repository

- **WHEN** a user submits the new-session form with `branchName_<repoId>=feature/foo` and `branchMode_<repoId>=sync` for a repository
- **AND** the repository is a git repository
- **THEN** the system clones that repository's remote directly onto `feature/foo` (equivalent to `git clone --branch feature/foo`)
- **AND** the system does NOT call the VCS `createBranch` operation for that repository
- **AND** the system persists the repository's session branch as `feature/foo`

#### Scenario: Mixed modes across repositories

- **WHEN** a multi-repo session is created with repository A in `new` mode and repository B in `sync` mode with different branch names
- **THEN** each repository is cloned and branched according to its own mode and name
- **AND** each repository's resolved branch is persisted independently

#### Scenario: Sync mode requires branch name per repository

- **WHEN** a user submits the new-session form with `branchMode_<repoId>=sync` and an empty `branchName_<repoId>` for a repository
- **THEN** the system responds with HTTP 400
- **AND** the response body names the repository and explains that a branch name is required when syncing

#### Scenario: Sync mode rejected for fossil repositories

- **WHEN** a user submits the new-session form with `branchMode_<repoId>=sync` for a repository whose `repoType` is `fossil`
- **THEN** the system responds with HTTP 400
- **AND** the response body names the repository and explains that sync mode is only supported for git repositories
- **AND** no clone or branch operation is attempted

#### Scenario: Sync clone failure names the repository

- **WHEN** a user submits the new-session form with `branchMode_<repoId>=sync` and `branchName_<repoId>=feature/missing`
- **AND** the remote does not contain `feature/missing`
- **THEN** the VCS clone fails with an error like "Remote branch feature/missing not found in upstream origin"
- **AND** the system responds with HTTP 500 including that error and the repository name
- **AND** the partially-created session record is deleted

#### Scenario: Flat fields apply to all repositories (back-compat)

- **WHEN** a client submits the new-session form with flat `branchName` and/or `branchMode` fields without any `_<repoId>`-suffixed fields
- **THEN** the flat values apply to every repository of the project
- **AND** an omitted `branchMode` is treated as `new`

#### Scenario: Per-repo fields take precedence over flat fields

- **WHEN** a client submits both a flat `branchName` and a `branchName_<repoId>` for the same repository
- **THEN** the `_<repoId>`-suffixed value is used for that repository
- **AND** the flat value still applies to repositories without a suffixed field

#### Scenario: Empty branch name in new mode falls back to project default

- **WHEN** a repository's mode resolves to `new` and its resolved branch name is empty
- **THEN** the branch name falls back to that repository's configured `newBranch`
- **AND** when the repository has no `newBranch` configured, no branch is created and no branch is persisted
- **AND** the session-creation form auto-fills new-mode branch inputs with the slugified session name client-side until manually edited
