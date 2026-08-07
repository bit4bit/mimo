## ADDED Requirements

### Requirement: Right panel switches between Sessions and Features tabs

The right panel of the unified projects view SHALL provide a tab switch between "Sessions" (existing sessions table) and "Features" (the project's feature list). The active tab MUST be reflected in a `tab` query parameter, defaulting to Sessions.

#### Scenario: Switch to Features tab

- **WHEN** authenticated user selects a project and clicks the "Features" tab
- **THEN** the right panel displays the project's feature list instead of the sessions table
- **AND** the URL contains `tab=features`

#### Scenario: Default tab

- **WHEN** authenticated user opens the projects view without a `tab` parameter
- **THEN** the right panel displays the sessions table
