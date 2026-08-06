## MODIFIED Requirements

### Requirement: Projects contain multiple mounted repositories

The system SHALL model a project as a collection of repository references. Each project repository entry SHALL include a repoId referencing a managed repository, a mountPath, and optional branch configuration (sourceBranch, newBranch). Repository connection details (repoUrl, repoType, credentialId, clonePort) SHALL be resolved from the referenced managed repository and SHALL NOT be stored on the project entry. The project schema SHALL NOT carry legacy top-level mirror fields (repoUrl, repoType, credentialId, sourceBranch, newBranch, clonePort) nor a primary repository flag; consumers needing a default repository use the first entry.

#### Scenario: Create project by picking managed repositories

- **WHEN** an authenticated user creates a project and picks managed repositories "backend" and "frontend"
- **AND** enters mount path "backend" for backend and "frontend" for frontend
- **THEN** the system stores both repository references on the project
- **AND** each entry retains its own mount path and branch configuration
- **AND** no primary flag or top-level connection mirror fields are stored

#### Scenario: Mount paths are validated

- **WHEN** a project repository mount path contains `..`, is absolute, is `.git`, duplicates another mount path, or nests inside another mount path
- **THEN** the system rejects the project with a validation error

#### Scenario: Project rejects unknown repository reference

- **WHEN** an authenticated user creates or updates a project referencing a repository id that does not exist or is owned by another user
- **THEN** the system rejects the project with a validation error

### Requirement: Project forms pick repositories instead of editing them inline

The system SHALL present managed repositories in the project create/edit form as a selectable list. For each selected repository the form SHALL provide fields for mount path and optional branch configuration. The form SHALL NOT require or allow editing repository URL, credential, or clone port inline.

#### Scenario: Pick repositories in project form

- **WHEN** an authenticated user views the project create or edit form
- **THEN** the system lists the user's managed repositories for selection
- **AND** each selected repository shows mount path and branch configuration fields

#### Scenario: No managed repositories available

- **WHEN** an authenticated user views the project create form and owns no managed repositories
- **THEN** the system indicates that a repository must be created first
- **AND** provides navigation to the Repositories section
