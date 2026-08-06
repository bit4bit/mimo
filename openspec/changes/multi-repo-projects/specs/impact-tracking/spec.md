## MODIFIED Requirements

### Requirement: Real-time impact metrics

The system SHALL calculate and display file impact metrics in real-time for a selected repository or as an aggregate across session repositories, comparing each agent-workspace repository checkout against its matching upstream checkout.

#### Scenario: Calculate file counts for selected repository

- **WHEN** the Impact buffer is loaded or refreshed with repository "backend" selected
- **THEN** the system scans that repository upstream and agent-workspace directories
- **AND** calculates new, changed, and deleted files for that repository

#### Scenario: Calculate aggregate file counts

- **WHEN** the Impact buffer is loaded or refreshed with all repositories selected
- **THEN** the system aggregates new, changed, and deleted file counts across session repositories
- **AND** preserves per-repository breakdown for display

### Requirement: Lines of Code tracking

The system SHALL track lines of code changes between upstream and agent-workspace per repository and in aggregate.

#### Scenario: Calculate LOC metrics

- **WHEN** the Impact buffer displays metrics
- **THEN** show total lines added, removed, and net LOC change for the selected repository or aggregate
- **AND** display trend indicators for each metric

### Requirement: 5-second polling

The system SHALL auto-refresh impact metrics every 5 seconds while the session page is active for the current impact repository selection.

#### Scenario: Poll for updates

- **WHEN** user is on the session detail page with repository "frontend" selected in Impact
- **THEN** the client polls the session impact endpoint every 5 seconds with that repository selection
- **AND** updates the Impact buffer with fresh metrics
