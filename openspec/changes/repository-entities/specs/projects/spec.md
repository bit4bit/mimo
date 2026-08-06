## MODIFIED Requirements

### Requirement: Projects can reference VCS credentials

The system SHALL associate credentials with projects indirectly: each project repository references a managed repository, and the managed repository optionally references a VCS credential by ID. Credential assignment SHALL be edited in the Repositories section, not in the project form.

#### Scenario: Project repository credential comes from managed repository

- **WHEN** an authenticated user picks a managed repository whose credentialId is "cred-uuid" in a project
- **THEN** sessions created for that project repository use credential "cred-uuid"

#### Scenario: Change credential for all referencing projects

- **WHEN** an authenticated user edits a managed repository to change or clear its credential
- **THEN** all projects referencing that repository use the updated credential for subsequent operations
- **AND** a repository without a credential operates as public

#### Scenario: Credential display in project details

- **WHEN** an authenticated user views a project with associated repositories
- **THEN** the system displays each repository name and its credential name
- **AND** the system does not display usernames, passwords, or private keys
- **AND** repositories without a credential display a "Public repository" or similar indicator

## REMOVED Requirements

### Requirement: Projects validate credential ownership

**Reason**: Credential ownership is validated once on the managed repository; project entries no longer carry credential references.

**Migration**: Existing inline project repository credentials are migrated to managed repositories by the migration script, which validates credential ownership during conversion.
