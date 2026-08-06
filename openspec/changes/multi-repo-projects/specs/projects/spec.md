## MODIFIED Requirements

### Requirement: Projects can reference VCS credentials

The system SHALL allow each project repository to optionally reference a VCS credential by ID.

#### Scenario: Create project repository with credential

- **WHEN** authenticated user creates a project repository with repoUrl "https://github.com/user/repo.git" and credentialId "cred-uuid"
- **THEN** system stores the repository entry with credentialId reference
- **AND** system validates credential exists and belongs to user

#### Scenario: Edit project repository credential

- **WHEN** authenticated user edits a project repository to change credentialId
- **THEN** system updates that repository entry with the new credential reference

#### Scenario: Remove project repository credential

- **WHEN** authenticated user edits a project repository and clears credential selection
- **THEN** system removes credentialId from that repository entry
- **AND** that repository operates as public

#### Scenario: Credential dropdown in project repository form

- **WHEN** authenticated user views project create or edit form
- **THEN** system displays credential choices for each repository entry
- **AND** each repository credential selector includes "None" option for public repositories

### Requirement: Projects validate credential ownership

The system SHALL ensure project repositories can only reference credentials owned by the project owner.

#### Scenario: Cannot use another user's credential

- **WHEN** authenticated user "alice" attempts to create or update a project repository with credential owned by "bob"
- **THEN** system returns validation error
- **AND** system prevents the project change

#### Scenario: Credential validation on project update

- **WHEN** authenticated user updates any project repository with a credential they don't own
- **THEN** system returns validation error
- **AND** system rejects update

### Requirement: Display credential info in project details

The system SHALL display credential names, not credential secrets, for each project repository in project detail view.

#### Scenario: Project detail shows repository credentials

- **WHEN** authenticated user views a project with associated repository credentials
- **THEN** system displays each repository name and credential name
- **AND** system does not display usernames, passwords, or private keys

#### Scenario: Project detail shows public repositories

- **WHEN** authenticated user views a project repository without a credential
- **THEN** system displays "Public repository" or similar indicator for that repository
