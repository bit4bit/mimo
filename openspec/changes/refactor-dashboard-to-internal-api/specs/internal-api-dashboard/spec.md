## ADDED Requirements

### Requirement: Dashboard data aggregation endpoint

The system SHALL provide an internal API endpoint that returns aggregated dashboard data.

#### Scenario: User requests dashboard data

- **WHEN** a GET request is made to `/api/internal/dashboard`
- **THEN** the system SHALL return projects, agents, and recent sessions
