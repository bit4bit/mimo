## ADDED Requirements

### Requirement: Repositories are managed entities

The system SHALL provide a Repositories management section where authenticated users can create, list, edit, and delete repositories. A repository SHALL include an id, name, repoUrl, repoType, optional credentialId, and optional clonePort.

#### Scenario: Create repository

- **WHEN** an authenticated user creates a repository with name "backend", repoUrl "https://github.com/user/backend.git", and credential "github-cred"
- **THEN** the system stores the repository owned by that user
- **AND** the repository appears in the user's Repositories list

#### Scenario: Repositories section follows existing management sections

- **WHEN** an authenticated user navigates the platform
- **THEN** the system shows a "Repositories" section alongside sections such as "Credentials" and "Agents"
- **AND** the section provides list, create, edit, and delete actions consistent with those sections

#### Scenario: Repository name required and unique per owner

- **WHEN** an authenticated user creates a repository with a name already used by another of their repositories
- **THEN** the system rejects the creation with a validation error

### Requirement: Repositories reference VCS credentials

The system SHALL allow each managed repository to optionally reference a VCS credential by ID, and SHALL validate that the credential exists and is owned by the repository owner.

#### Scenario: Create repository with credential

- **WHEN** an authenticated user creates a repository with credentialId "cred-uuid" they own
- **THEN** the system stores the repository with the credential reference

#### Scenario: Cannot use another user's credential

- **WHEN** an authenticated user attempts to create or update a repository with a credential owned by another user
- **THEN** the system returns a validation error and prevents the change

#### Scenario: Repository secrets are never displayed

- **WHEN** an authenticated user views a repository in the Repositories section
- **THEN** the system displays the credential name, not usernames, passwords, or private keys

### Requirement: Repository edits propagate to referencing projects

The system SHALL apply edits to a repository's repoUrl, credentialId, or clonePort to all projects referencing that repository, since projects store only references.

#### Scenario: Edit shared repository credential

- **WHEN** a repository is referenced by two projects
- **AND** the owner changes the repository's credential
- **THEN** subsequent session creation for either project uses the new credential

#### Scenario: Edit view shows referencing projects

- **WHEN** an authenticated user edits a repository referenced by projects
- **THEN** the system displays the names of the referencing projects before the change is saved

### Requirement: Repository deletion is blocked while referenced

The system SHALL reject deletion of a repository while any project references it.

#### Scenario: Delete referenced repository

- **WHEN** an authenticated user attempts to delete a repository referenced by project "web-app"
- **THEN** the system rejects the deletion
- **AND** reports the referencing project names

#### Scenario: Delete unreferenced repository

- **WHEN** an authenticated user deletes a repository not referenced by any project
- **THEN** the system removes the repository
