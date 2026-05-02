## ADDED Requirements

### Requirement: List projects endpoint
The system SHALL provide an internal API endpoint that returns all projects for the authenticated user.

#### Scenario: User requests project list
- **WHEN** an authenticated GET request is made to `/api/internal/projects`
- **THEN** the system SHALL return a list of projects owned by the authenticated user
- **AND** each project SHALL include id, name, repoUrl, repoType, description, and metadata

### Requirement: Get project endpoint
The system SHALL provide an internal API endpoint that returns a specific project by ID.

#### Scenario: User requests specific project
- **WHEN** an authenticated GET request is made to `/api/internal/projects/:id`
- **THEN** the system SHALL return the project with the matching ID
- **AND** the project SHALL include all fields and related session count

#### Scenario: User requests non-existent project
- **WHEN** an authenticated GET request is made to `/api/internal/projects/:id` for a non-existent project
- **THEN** the system SHALL return a 404 error

### Requirement: Create project endpoint
The system SHALL provide an internal API endpoint that creates a new project.

#### Scenario: User creates valid project
- **WHEN** an authenticated POST request is made to `/api/internal/projects` with valid project data
- **THEN** the system SHALL create a new project
- **AND** return the created project with its assigned ID

#### Scenario: User creates project with invalid data
- **WHEN** an authenticated POST request is made to `/api/internal/projects` with invalid data
- **THEN** the system SHALL return a 400 error with validation details

### Requirement: Update project endpoint
The system SHALL provide an internal API endpoint that updates an existing project.

#### Scenario: User updates existing project
- **WHEN** an authenticated PUT request is made to `/api/internal/projects/:id` with valid update data
- **THEN** the system SHALL update the project
- **AND** return the updated project

### Requirement: Delete project endpoint
The system SHALL provide an internal API endpoint that deletes a project.

#### Scenario: User deletes project
- **WHEN** an authenticated DELETE request is made to `/api/internal/projects/:id`
- **THEN** the system SHALL delete the project and its associated data
- **AND** return a success confirmation

### Requirement: List project sessions endpoint
The system SHALL provide an internal API endpoint that returns all sessions for a specific project.

#### Scenario: User requests project sessions
- **WHEN** an authenticated GET request is made to `/api/internal/projects/:id/sessions`
- **THEN** the system SHALL return all sessions belonging to the project
- **AND** include session metadata (id, name, status, createdAt, priority)
