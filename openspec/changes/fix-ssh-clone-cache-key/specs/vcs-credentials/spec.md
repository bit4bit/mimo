## MODIFIED Requirements

### Requirement: SSH credential injection via GIT_SSH_COMMAND

The system SHALL use GIT_SSH_COMMAND environment variable to pass SSH private keys to git operations. This applies to every git operation that contacts the SSH remote, including the cache-backed clone (`git clone --reference <cache> <repoUrl> <target>`), which still negotiates with the remote and therefore SHALL inject the credential's private key.

#### Scenario: Clone with SSH credentials

- **WHEN** system clones repository "git@github.com:org/repo.git" with SSH credential containing private key
- **THEN** system writes private key to temporary file with 600 permissions
- **AND** system sets GIT_SSH_COMMAND to "ssh -i /tmp/key-xxxx -o IdentitiesOnly=yes -o StrictHostKeyChecking=no"
- **AND** system executes git clone
- **AND** system deletes temporary key file after operation

#### Scenario: Cache-backed clone with SSH credentials

- **WHEN** system clones from the project cache using `git clone --reference <cache> "git@github.com:org/repo.git" <target>` with an SSH credential
- **THEN** system writes the credential's private key to a temporary file with 600 permissions
- **AND** system sets GIT_SSH_COMMAND with `-i <temp-key-path>` for the cache-backed clone command
- **AND** the clone authenticates to the remote with the assigned private key rather than any ambient ssh-agent or `~/.ssh` identity
- **AND** system deletes the temporary key file after the operation completes or fails

#### Scenario: Cache git subprocess inherits the parent environment

- **WHEN** system runs a cache git operation (`refresh`, bare clone, fetch, or cache-backed clone) with GIT_SSH_COMMAND injected
- **THEN** the spawned git process environment SHALL include the parent process environment (such as `PATH` and `HOME`) merged with the injected `GIT_SSH_COMMAND`
- **AND** the injected `ssh` command resolves and runs correctly even in a minimal container, instead of failing because `PATH`/`HOME` were stripped

#### Scenario: Push with SSH credentials

- **WHEN** system pushes to git remote with configured SSH credential
- **THEN** system injects SSH key via GIT_SSH_COMMAND
- **AND** system executes git push
- **AND** system cleans up temporary key file

#### Scenario: Temporary SSH key cleanup on failure

- **WHEN** git operation with SSH credential fails
- **THEN** system still deletes temporary key file
- **AND** system displays error message
