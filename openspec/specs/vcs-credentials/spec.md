## ADDED Requirements

### Requirement: User can create HTTPS VCS credentials
The system SHALL allow authenticated users to create HTTPS VCS credentials with a name, username, and password/token.

#### Scenario: Successful HTTPS credential creation
- **WHEN** authenticated user submits credential creation form with type "https", name "GitHub Work", username "developer", and password "ghp_token123"
- **THEN** system stores credential in user's credentials directory
- **AND** system displays success message
- **AND** system redirects to credentials list page

#### Scenario: HTTPS credential name validation
- **WHEN** authenticated user submits credential with empty name
- **THEN** system displays validation error requiring name

### Requirement: User can create SSH VCS credentials
The system SHALL allow authenticated users to create SSH VCS credentials with a name and private key.

#### Scenario: Successful SSH credential creation
- **WHEN** authenticated user submits credential creation form with type "ssh", name "GitHub SSH", and private key "-----BEGIN OPENSSH PRIVATE KEY-----\n..."
- **THEN** system stores credential in user's credentials directory
- **AND** system validates private key format
- **AND** system displays success message

#### Scenario: SSH key format validation
- **WHEN** authenticated user submits SSH credential with invalid private key format
- **THEN** system displays validation error: "Invalid SSH private key format"
- **AND** system rejects the credential

### Requirement: Credentials are user-scoped
The system SHALL ensure users can only access their own credentials.

#### Scenario: User views own credentials
- **WHEN** authenticated user "alice" requests credentials list
- **THEN** system displays only credentials owned by "alice"

#### Scenario: User cannot access other credentials
- **WHEN** authenticated user "alice" attempts to access credential owned by "bob"
- **THEN** system returns 404 not found

### Requirement: Credentials stored securely
The system SHALL store credential files with 600 permissions (owner read/write only).

#### Scenario: Credential file permissions
- **WHEN** system creates credential file
- **THEN** file has permissions set to 600
- **AND** file is stored in /data/users/<username>/credentials/

### Requirement: User can list credentials
The system SHALL display all credentials owned by the authenticated user.

#### Scenario: Credentials list displays
- **WHEN** authenticated user navigates to /credentials
- **THEN** system displays list of all user's credentials
- **AND** each credential shows name, type (https/ssh), and masked password/key indicator
- **AND** password and private key are masked (********)

### Requirement: User can edit credentials
The system SHALL allow users to update credential name and credentials for HTTPS, and name for SSH.

#### Scenario: Successful HTTPS credential update
- **WHEN** authenticated user edits HTTPS credential "GitHub Work" with new password
- **THEN** system updates stored credential
- **AND** system displays success message

#### Scenario: Successful SSH credential name update
- **WHEN** authenticated user edits SSH credential name from "GitHub SSH" to "Work SSH"
- **THEN** system updates stored credential
- **AND** system displays success message

#### Scenario: SSH private key update
- **WHEN** authenticated user updates SSH credential with new private key
- **THEN** system validates new key format
- **AND** system updates stored credential
- **AND** system displays success message

### Requirement: User can delete credentials
The system SHALL allow users to delete their credentials.

#### Scenario: Successful credential deletion
- **WHEN** authenticated user deletes credential "GitHub Work"
- **THEN** system removes credential file
- **AND** system displays success message

#### Scenario: Delete credential in use by project
- **WHEN** authenticated user deletes credential referenced by a project
- **THEN** system deletes credential
- **AND** system warns that projects may fail authentication

### Requirement: HTTPS credential injection into repository URLs
The system SHALL inject HTTPS credentials into repository URLs for authenticated operations.

#### Scenario: Clone with HTTPS credentials
- **WHEN** system clones repository "https://github.com/org/repo.git" with HTTPS credential username "user" and password "token"
- **THEN** system executes clone with URL "https://user:token@github.com/org/repo.git"

#### Scenario: Push with HTTPS credentials
- **WHEN** system pushes to git remote with configured HTTPS credential
- **THEN** system injects credentials into push URL

### Requirement: SSH credential injection via GIT_SSH_COMMAND
The system SHALL use GIT_SSH_COMMAND environment variable to pass SSH private keys to git operations.

#### Scenario: Clone with SSH credentials
- **WHEN** system clones repository "git@github.com:org/repo.git" with SSH credential containing private key
- **THEN** system writes private key to temporary file with 600 permissions
- **AND** system sets GIT_SSH_COMMAND to "ssh -i /tmp/key-xxxx -o IdentitiesOnly=yes -o StrictHostKeyChecking=no"
- **AND** system executes git clone
- **AND** system deletes temporary key file after operation

#### Scenario: Push with SSH credentials
- **WHEN** system pushes to git remote with configured SSH credential
- **THEN** system injects SSH key via GIT_SSH_COMMAND
- **AND** system executes git push
- **AND** system cleans up temporary key file

#### Scenario: Temporary SSH key cleanup on failure
- **WHEN** git operation with SSH credential fails
- **THEN** system still deletes temporary key file
- **AND** system displays error message

### Requirement: Credential type must match repository URL type
The system SHALL validate that credential type matches repository URL type.

#### Scenario: HTTPS credential for HTTPS URL
- **WHEN** project has HTTPS URL and user selects HTTPS credential
- **THEN** system accepts the credential

#### Scenario: SSH credential for SSH URL
- **WHEN** project has SSH URL and user selects SSH credential
- **THEN** system accepts the credential

#### Scenario: Credential type mismatch
- **WHEN** project has SSH URL but user selects HTTPS credential
- **THEN** system displays validation error: "Credential type does not match repository URL type"

### Requirement: Fail-fast on authentication errors
The system SHALL fail immediately with clear error messages when authentication fails.

#### Scenario: Clone fails due to bad HTTPS credentials
- **WHEN** system attempts to clone private repository with invalid HTTPS credentials
- **THEN** operation fails immediately
- **AND** system displays error: "Authentication failed. Please check your credentials and repository access."

#### Scenario: Clone fails due to bad SSH key
- **WHEN** system attempts to clone private repository with invalid SSH key
- **THEN** operation fails immediately
- **AND** system displays error: "SSH authentication failed. Please check your private key and repository access."

#### Scenario: Credential not found for operation
- **WHEN** system attempts operation requiring credential but credential does not exist
- **THEN** operation fails
- **AND** system displays error: "Credential not found. Please select a valid credential for this project."
