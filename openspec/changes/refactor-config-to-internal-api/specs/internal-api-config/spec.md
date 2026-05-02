## ADDED Requirements

### Requirement: Get configuration endpoint
The system SHALL provide an internal API endpoint that returns the current configuration.

#### Scenario: User requests configuration
- **WHEN** an authenticated GET request is made to `/api/internal/config`
- **THEN** the system SHALL return the current configuration object
- **AND** include theme, fontSize, fontFamily, and sessionKeybindings

### Requirement: Update configuration endpoint
The system SHALL provide an internal API endpoint that updates configuration with validation.

#### Scenario: User updates configuration successfully
- **WHEN** an authenticated PUT request is made to `/api/internal/config` with valid configuration
- **THEN** the system SHALL validate the configuration
- **AND** save the configuration
- **AND** return the saved configuration

#### Scenario: User submits invalid configuration
- **WHEN** an authenticated PUT request is made to `/api/internal/config` with invalid values
- **THEN** the system SHALL return a 400 error with validation errors
- **AND** not save any changes

### Requirement: Reset configuration endpoint
The system SHALL provide an internal API endpoint that resets configuration to defaults.

#### Scenario: User resets configuration
- **WHEN** an authenticated POST request is made to `/api/internal/config/reset`
- **THEN** the system SHALL reset configuration to defaults
- **AND** return the default configuration
