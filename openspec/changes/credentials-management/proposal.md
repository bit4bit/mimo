## Why

Projects currently cannot authenticate with private Git or Fossil repositories. Users need to store credentials (HTTPS tokens, passwords, SSH keys) securely and associate them with projects for repository operations like cloning and pushing. Credentials should be user-owned, not project-embedded, to allow reuse across multiple projects.

## What Changes

- **New Credentials Section**: Users can create, manage, and delete VCS credentials from a dedicated UI section
- **HTTPS Credential Support**: Store username/password or token pairs for HTTPS-based repository authentication
- **SSH Credential Support**: Store SSH private keys for Git repository authentication (using GIT_SSH_COMMAND for secure key injection)
- **Project Integration**: Projects can optionally reference a credential for authenticated repository operations
- **HTTPS Credential Injection**: Credentials are injected into repository URLs at runtime
- **SSH Credential Injection**: SSH keys are passed via GIT_SSH_COMMAND environment variable using temporary key files
- **Fail-Fast Errors**: Repository operations fail immediately with clear error messages if authentication fails

## Capabilities

### New Capabilities
- `vcs-credentials`: User-scoped storage and management of VCS authentication credentials (HTTPS username/password/tokens and SSH private keys)

### Modified Capabilities
- `projects`: Add optional `credentialId` field to project model for associating a credential with a project's repository

## Impact

- **New routes**: `/credentials` (list, create, edit, delete)
- **New components**: CredentialsListPage, CredentialCreatePage, CredentialEditPage (with type selection: HTTPS/SSH)
- **Modified routes**: Project creation/editing forms to include credential selection dropdown with type validation
- **VCS operations**: Clone, push, and sync operations support both HTTPS (URL injection) and SSH (GIT_SSH_COMMAND) authentication
- **Storage**: New `/data/users/<username>/credentials/` directory for credential YAML files
- **Security**: Credentials stored with file permissions 600 (owner read/write only); SSH keys written to temporary files during operations
- **No breaking changes**: Existing projects without credentials continue to work as public repositories
