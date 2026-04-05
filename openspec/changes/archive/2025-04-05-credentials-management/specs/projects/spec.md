## ADDED Requirements

### Requirement: Projects can reference VCS credentials
The system SHALL allow projects to optionally reference a VCS credential by ID.

#### Scenario: Create project with credential
- **WHEN** authenticated user creates project with repoUrl "https://github.com/user/repo.git" and credentialId "cred-uuid"
- **THEN** system stores project with credentialId reference
- **AND** system validates credential exists and belongs to user

#### Scenario: Edit project credential
- **WHEN** authenticated user edits project to change credentialId
- **THEN** system updates project with new credential reference

#### Scenario: Remove project credential
- **WHEN** authenticated user edits project and clears credential selection
- **THEN** system removes credentialId from project
- **AND** project operates as public repository

#### Scenario: Credential dropdown in project form
- **WHEN** authenticated user views project create or edit form
- **THEN** system displays dropdown with user's credentials
- **AND** dropdown includes "None" option for public repositories

### Requirement: Projects validate credential ownership
The system SHALL ensure projects can only reference credentials owned by the project owner.

#### Scenario: Cannot use another user's credential
- **WHEN** authenticated user "alice" attempts to create project with credential owned by "bob"
- **THEN** system returns validation error
- **AND** system prevents project creation

#### Scenario: Credential validation on project update
- **WHEN** authenticated user updates project with credential they don't own
- **THEN** system returns validation error
- **AND** system rejects update

### Requirement: Display credential info in project details
The system SHALL display credential name (not credentials themselves) in project detail view.

#### Scenario: Project detail shows credential
- **WHEN** authenticated user views project with associated credential
- **THEN** system displays credential name
- **AND** system does not display username or password

#### Scenario: Project detail shows no credential
- **WHEN** authenticated user views project without credential
- **THEN** system displays "Public repository" or similar indicator
