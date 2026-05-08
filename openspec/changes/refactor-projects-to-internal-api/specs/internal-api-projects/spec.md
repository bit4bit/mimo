## ADDED Requirements

### Requirement: List projects endpoint

The system SHALL provide an internal API endpoint that returns all projects for the authenticated user.

#### Scenario: User requests project list

- **WHEN** a GET request is made to `/api/internal/projects`
- **THEN** the system SHALL return a list of projects owned by the user

### Requirement: Get project endpoint

The system SHALL provide an internal API endpoint that returns a specific project.

#### Scenario: User requests specific project

- **WHEN** a GET request is made to `/api/internal/projects/:id`
- **THEN** the system SHALL return the project with matching ID

### Requirement: Create project endpoint

The system SHALL provide an internal API endpoint that creates a new project.

#### Scenario: User creates project

- **WHEN** a POST request is made to `/api/internal/projects` with valid data
- **THEN** the system SHALL create the project and return it

### Requirement: Update project endpoint

The system SHALL provide an internal API endpoint that updates a project.

#### Scenario: User updates project

- **WHEN** a PUT request is made to `/api/internal/projects/:id` with update data
- **THEN** the system SHALL update the project and return it

### Requirement: Delete project endpoint

The system SHALL provide an internal API endpoint that deletes a project.

#### Scenario: User deletes project

- **WHEN** a DELETE request is made to `/api/internal/projects/:id`
- **THEN** the system SHALL delete the project

### Requirement: List project sessions endpoint

The system SHALL provide an internal API endpoint that returns sessions for a project.

#### Scenario: User requests project sessions

- **WHEN** a GET request is made to `/api/internal/projects/:id/sessions`
- **THEN** the system SHALL return sessions belonging to the project
