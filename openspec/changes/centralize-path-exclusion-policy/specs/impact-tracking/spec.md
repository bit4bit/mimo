## MODIFIED Requirements

### Requirement: Real-time impact metrics

The system SHALL calculate and display file impact metrics in real-time, comparing agent-workspace against upstream.

#### Scenario: Calculate file counts

- **WHEN** the Impact buffer is loaded or refreshed
- **THEN** the system SHALL scan both upstream/ and agent-workspace/ directories
- **AND** calculate new files (in workspace, not in upstream)
- **AND** calculate changed files (in both, different checksum)
- **AND** calculate deleted files (in upstream, not in workspace)
- **AND** exclude VCS-internal and Mimo-internal paths from all counts

#### Scenario: Impact analysis excludes system paths

- **GIVEN** the workspace contains `.git/`, `.fossil/`, `.mimo/`, `.sccignore`, or `.jscpdignore`
- **WHEN** impact metrics are calculated
- **THEN** these paths are not counted as added, changed, or deleted
- **AND** the exclusion logic uses the centralized `isExcluded` function
