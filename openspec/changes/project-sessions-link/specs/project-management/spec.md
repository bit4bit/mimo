## MODIFIED Requirements

### Requirement: User can switch between projects
The system SHALL allow users to select a project and view its sessions.

#### Scenario: Switch to project
- **WHEN** user selects project from list
- **THEN** system loads project context
- **AND** system displays project details
- **AND** system displays project's sessions in a Sessions section
- **AND** each session shows name and creation date
- **AND** "New Session" button is visible

#### Scenario: Switch to project with no sessions
- **WHEN** user selects project from list
- **AND** project has no sessions
- **THEN** system displays "No sessions yet. Create one to start development."
- **AND** system displays "New Session" button