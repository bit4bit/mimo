## ADDED Requirements

### Requirement: Get configuration endpoint

The system SHALL provide an internal API endpoint that returns the current system configuration.

#### Scenario: User requests configuration

- **WHEN** an authenticated GET request is made to `/api/internal/config`
- **THEN** the system SHALL return the current configuration settings

### Requirement: Update configuration endpoint

The system SHALL provide an internal API endpoint that updates system configuration.

#### Scenario: User updates configuration

- **WHEN** an authenticated PUT request is made to `/api/internal/config` with configuration updates
- **THEN** the system SHALL validate and apply the configuration changes
- **AND** return the updated configuration

#### Scenario: User submits invalid configuration

- **WHEN** an authenticated PUT request is made to `/api/internal/config` with invalid values
- **THEN** the system SHALL return a 400 error with validation details
- **AND** not apply any changes
