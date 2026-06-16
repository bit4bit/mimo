## ADDED Requirements

### Requirement: Git import supports large repositories without fixed timeout

The system SHALL import large Git repositories into Fossil using configurable and progress-logged timeouts.

#### Scenario: Import a 100,000-file repository

- **WHEN** a user imports a Git repository with 100,000 tracked files
- **THEN** the import does not abort at the previous 10-minute hard limit
- **AND** progress is logged at least every 30 seconds

### Requirement: Clone and import phases are separate

The system SHALL split Git repository import into a Git clone/fetch phase and a Fossil import phase.

#### Scenario: Import progresses through phases

- **WHEN** a Git import begins
- **THEN** the system logs "git clone started"
- **AND** logs "fossil import started" after the clone completes
- **AND** logs completion or failure of each phase

### Requirement: Import timeouts are configurable by environment

The system SHALL read clone and import timeout values from environment variables injected at startup.

#### Scenario: Environment provides import timeout

- **WHEN** MIMO_IMPORT_TIMEOUT_MS is set to 3600000
- **THEN** the Fossil import phase uses that timeout
- **AND** the Git clone phase uses MIMO_CLONE_TIMEOUT_MS if set
- **AND** sensible defaults apply when variables are not set

### Requirement: Import reports failure cause clearly

The system SHALL distinguish between clone failure, import failure, and timeout failure.

#### Scenario: Fossil import times out

- **WHEN** the Fossil import phase exceeds its timeout
- **THEN** the system returns an error: "Fossil import timed out after N ms"
- **AND** does not report a generic import failure

### Requirement: No environment access inside VCS service

The system SHALL resolve timeout configuration at the composition root and inject it into `VCSConfig`.

#### Scenario: VCS service construction

- **WHEN** the `VCS` class is instantiated
- **THEN** it receives cloneTimeoutMs and importTimeoutMs as constructor arguments
- **AND** the class does not read process.env
