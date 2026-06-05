## MODIFIED Requirements

### Requirement: SSH port injected into Git SSH command

The system SHALL inject `-p <port>` into the `ssh` command used for Git
operations whenever an effective SSH port is configured, and SHALL build that
command when either an SSH key credential or an SSH port is present. This
applies to the project-level VCS cache operations (`refresh` and the
cache-backed `git clone --reference`) as well as direct clones; a configured
SSH port SHALL NOT be silently dropped when an operation is served by the
cache.

#### Scenario: Port injected with an SSH key

- **WHEN** an effective SSH port is set and the credential is an SSH key
- **THEN** the SSH command includes both `-i <keyfile>` and `-p <port>`

#### Scenario: Port injected without an SSH key

- **WHEN** an effective SSH port is set and no SSH-key credential is provided
- **THEN** the SSH command includes `-p <port>` and does not include `-i`

#### Scenario: SSH key without a port

- **WHEN** an SSH-key credential is provided and no SSH port is set
- **THEN** the SSH command includes `-i <keyfile>` and does not include `-p`

#### Scenario: Port honored when refreshing the project cache

- **WHEN** a project with a custom SSH port is pre-warmed or refreshed and the cache performs `git clone --bare` / `git fetch`
- **THEN** the SSH command used for the cache operation includes `-p <port>`
- **AND** the cache connects to the configured port rather than defaulting to 22

#### Scenario: Port honored when cloning from the cache

- **WHEN** a session clones from the project cache via `git clone --reference <cache> <repoUrl> <target>` and a custom SSH port is configured
- **THEN** the SSH command for the cache-backed clone includes `-p <port>`
