## MODIFIED Requirements

### Requirement: Real-time impact metrics
The system SHALL calculate and display file impact metrics in real-time, comparing agent-workspace against upstream.

#### Scenario: Calculate file counts
- **WHEN** the Impact buffer is loaded or refreshed
- **THEN** the system SHALL identify new files (in workspace, not in upstream)
- **AND** calculate changed files (in both, different checksum)
- **AND** calculate deleted files (in upstream, not in workspace)
- **AND** the system SHALL NOT perform a full recursive scan of both directories when a cached baseline exists

#### Scenario: Refresh in large repository with small change
- **WHEN** the Impact buffer is refreshed in a repository with 100,000 files
- **AND** only one file has changed
- **THEN** the system completes the refresh without scanning all 100,000 files
- **AND** metrics are derived from the changed file and cached baseline

### Requirement: 5-second polling
The system SHALL auto-refresh impact metrics every 5 seconds while the session page is active.

#### Scenario: Poll for updates
- **WHEN** user is on the session detail page
- **THEN** the client SHALL poll /sessions/:id/impact every 5 seconds
- **AND** update the Impact buffer with fresh incremental metrics
- **AND** each poll completes in under 5 seconds for large repositories
