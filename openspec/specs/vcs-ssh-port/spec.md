## ADDED Requirements

### Requirement: Custom SSH port configuration

The system SHALL allow a custom SSH port to be set manually on a project as the
default for its repository, and on a session as an override. The effective port
for any Git operation SHALL be the session port when set, otherwise the project
port, otherwise none (default SSH behavior).

#### Scenario: Project-level default port

- **WHEN** a project is created or updated with an SSH port of 3022
- **AND** a session under that project has no SSH port set
- **THEN** Git operations for that session use port 3022

#### Scenario: Session overrides project port

- **WHEN** a project has SSH port 3022 and a session under it sets SSH port 2222
- **THEN** Git operations for that session use port 2222

#### Scenario: No port configured

- **WHEN** neither the session nor the project has an SSH port set
- **THEN** Git operations use the default SSH port and the command is unchanged
  from prior behavior

### Requirement: SSH port validation

The system SHALL validate a submitted SSH port as an integer in the range 1 to
65535 inclusive, and SHALL reject any other value with a clear error.

#### Scenario: Valid port accepted

- **WHEN** a user submits an SSH port of 3022
- **THEN** the system stores 3022 on the project or session

#### Scenario: Out-of-range port rejected

- **WHEN** a user submits an SSH port of 70000 or 0
- **THEN** the system rejects the request with an error indicating the port must
  be between 1 and 65535

#### Scenario: Non-integer port rejected

- **WHEN** a user submits an SSH port that is not an integer (e.g. "abc" or 22.5)
- **THEN** the system rejects the request with a validation error

#### Scenario: Empty port leaves it unset

- **WHEN** a user leaves the SSH port field empty
- **THEN** no SSH port is stored and the effective port falls back to the project
  default or none

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
