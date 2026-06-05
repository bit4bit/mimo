## ADDED Requirements

### Requirement: Git operations honor the configured SSH port

The system SHALL use the effective configured SSH port for Git clone and Git push operations by passing `-p <port>` to the underlying `ssh` command when a port is configured. Fossil operations are unaffected.

#### Scenario: Clone over a custom SSH port

- **WHEN** a session's effective SSH port is 3022 and its repository is cloned
  over SSH
- **THEN** the git clone runs with an SSH command that includes `-p 3022`

#### Scenario: Push over a custom SSH port

- **WHEN** a session's effective SSH port is 3022 and changes are pushed to the
  original repository over SSH
- **THEN** the git push runs with an SSH command that includes `-p 3022`

#### Scenario: No configured port uses default

- **WHEN** a session has no effective SSH port
- **THEN** git clone and git push use the default SSH port and the SSH command is
  unchanged from prior behavior
