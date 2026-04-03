## MODIFIED Requirements

### Requirement: Project listing includes description
The system SHALL include project description in all project listings and detail views.

#### Scenario: List projects with descriptions
- **WHEN** user requests project list
- **THEN** each project includes description field
- **AND** descriptions are displayed in list view

#### Scenario: Project detail includes description
- **WHEN** user views project detail page
- **THEN** page displays project description
- **AND** editable if user is project owner

#### Scenario: Create project form includes description
- **WHEN** user creates new project
- **THEN** form includes description textarea
- **AND** description field is optional
- **AND** placeholder text suggests "Describe your project..."

#### Scenario: Update project form includes description
- **WHEN** project owner edits project
- **THEN** form includes description field
- **AND** existing description is pre-filled
- **AND** owner can clear description

## ADDED Requirements

### Requirement: Public project listing accessible without auth
The system SHALL provide a public endpoint for listing projects without authentication.

#### Scenario: Public endpoint returns sanitized data
- **WHEN** client requests `GET /api/projects/public`
- **THEN** response includes:
  - id, name, description, repoType, owner, createdAt
- **AND** excludes:
  - repoUrl (may contain credentials or be private)
  - session information
  - internal metadata

#### Scenario: Public endpoint no auth required
- **WHEN** client requests public projects endpoint
- **AND** does not provide authentication token
- **THEN** endpoint returns 200 status
- **AND** does not redirect to login