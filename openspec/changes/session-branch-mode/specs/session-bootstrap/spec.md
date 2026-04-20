## ADDED Requirements

### Requirement: Session creation supports branch mode selection
The system SHALL accept a `branchMode` field on session creation that declares whether the supplied branch name refers to an existing remote branch (to sync) or a new branch (to create locally).

#### Scenario: Create new branch (default)
- **WHEN** a user submits the new-session form with `branchName=feature/foo` and `branchMode=new` (or omits `branchMode`)
- **THEN** the system clones the project's `sourceBranch` into the session upstream directory
- **AND** the system creates `feature/foo` locally via the VCS `createBranch` operation
- **AND** the system persists `session.branch = "feature/foo"` so the commit/push path targets it

#### Scenario: Sync existing remote branch
- **WHEN** a user submits the new-session form with `branchName=feature/foo` and `branchMode=sync`
- **AND** the project is a git repository
- **THEN** the system clones the remote directly onto `feature/foo` (equivalent to `git clone --branch feature/foo`)
- **AND** the system does NOT call the VCS `createBranch` operation
- **AND** the system persists `session.branch = "feature/foo"`

#### Scenario: Sync mode requires branch name
- **WHEN** a user submits the new-session form with `branchMode=sync` and an empty `branchName`
- **THEN** the system responds with HTTP 400
- **AND** the response body explains that a branch name is required when syncing

#### Scenario: Sync mode rejected for fossil repositories
- **WHEN** a user submits the new-session form with `branchMode=sync` for a project whose `repoType` is `fossil`
- **THEN** the system responds with HTTP 400
- **AND** the response body explains that sync mode is only supported for git repositories
- **AND** no clone or branch operation is attempted

#### Scenario: Sync clone failure surfaces remote error
- **WHEN** a user submits the new-session form with `branchMode=sync` and `branchName=feature/missing`
- **AND** the remote does not contain `feature/missing`
- **THEN** the VCS clone fails with an error like "Remote branch feature/missing not found in upstream origin"
- **AND** the system responds with HTTP 500 including that error
- **AND** the partially-created session record is deleted

#### Scenario: Omitting branchMode preserves existing behavior
- **WHEN** a client submits the new-session form without a `branchMode` field
- **THEN** the system treats the request as `branchMode=new`
- **AND** existing clone-then-createBranch behavior runs unchanged
