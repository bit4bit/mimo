## ADDED Requirements

### Requirement: Projects contain multiple mounted repositories

The system SHALL model a project as a collection of repositories. Each repository SHALL include an id, name, repoUrl, repoType, optional credentialId, optional branch configuration, optional clonePort, mountPath, and optional primary flag.

#### Scenario: Create project with multiple repositories

- **WHEN** an authenticated user creates a project with repositories "backend" mounted at "backend" and "frontend" mounted at "frontend"
- **THEN** the system stores both repository entries on the project
- **AND** each repository retains its own credential, branch, and mount path configuration

#### Scenario: Mount paths are validated

- **WHEN** a project repository mount path contains `..`, is absolute, is `.git`, duplicates another mount path, or nests inside another mount path
- **THEN** the system rejects the project with a validation error

### Requirement: Session workspaces deploy all project repositories

The system SHALL deploy every repository configured on a project into the session workspace using each repository mountPath. The agent workspace root SHALL be a container of repository checkouts and SHALL NOT be assumed to be the root of a single clone.

#### Scenario: Session created for multi-repo project

- **WHEN** a user creates a session for a project with repositories mounted at "backend" and "frontend"
- **THEN** the system creates upstream checkouts for both repositories under the session upstream directory
- **AND** creates agent workspace checkouts for both repositories under the session agent-workspace directory
- **AND** stores per-repository branch and baseline state

### Requirement: Files are repo-qualified

The system SHALL identify files in session operations by `repoId` and repo-relative `path`. Workspace-relative paths SHALL be resolved to a repository by longest matching mountPath.

#### Scenario: Resolve workspace path to repository

- **WHEN** a session has repositories mounted at "backend" and "frontend"
- **AND** an operation references workspace path "frontend/src/App.tsx"
- **THEN** the system resolves the file as repoId "frontend" with path "src/App.tsx"

### Requirement: Cross-repository commit is best-effort

The system SHALL apply a commit operation independently to each selected repository. A failure in one repository SHALL NOT roll back successful commits in other repositories.

#### Scenario: Partial commit failure

- **WHEN** a user commits the same message to repositories "backend" and "frontend"
- **AND** the backend push fails while the frontend commit succeeds
- **THEN** the response reports backend as failed with error details
- **AND** reports frontend as committed
- **AND** the frontend commit remains intact
