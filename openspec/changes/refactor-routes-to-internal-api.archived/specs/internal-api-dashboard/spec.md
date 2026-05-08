## ADDED Requirements

### Requirement: Dashboard data aggregation endpoint

The system SHALL provide an internal API endpoint that aggregates data for the dashboard view.

#### Scenario: User requests dashboard data

- **WHEN** an authenticated GET request is made to `/api/internal/dashboard`
- **THEN** the system SHALL return aggregated data including:
- **AND** user's projects list
- **AND** user's agents list
- **AND** recent sessions across all projects
- **AND** counts and summary statistics

### Requirement: Dashboard data filtering

The system SHALL support filtering dashboard data by various criteria.

#### Scenario: User requests filtered dashboard

- **WHEN** an authenticated GET request is made to `/api/internal/dashboard?limit={n}`
- **THEN** the system SHALL return dashboard data limited to n sessions
- **AND** apply any other provided filters
