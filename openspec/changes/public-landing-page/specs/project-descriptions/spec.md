## ADDED Requirements

### Requirement: Projects have optional description field
The system SHALL store an optional description field for each project.

#### Scenario: Create project with description
- **WHEN** user creates a new project
- **AND** provides description "A task management application"
- **THEN** system stores description in `project.yaml`
- **AND** description is displayed on project cards

#### Scenario: Create project without description
- **WHEN** user creates a new project
- **AND** does not provide description
- **THEN** system stores project without description field
- **AND** project list displays "No description" placeholder

#### Scenario: Update project description
- **WHEN** user updates project
- **AND** provides new description
- **THEN** system updates description in `project.yaml`
- **AND** changes are immediately visible

#### Scenario: Description length validation
- **WHEN** user provides description longer than 500 characters
- **THEN** system rejects description
- **AND** displays error "Description must be 500 characters or less"
- **AND** UI shows recommended limit of ~200 characters

### Requirement: Description displayed on project cards
The system SHALL display project descriptions appropriately in all project list views.

#### Scenario: Display on landing page cards
- **WHEN** project has description
- **THEN** landing page project card shows full description (up to 200 chars)
- **AND** descriptions longer than 200 chars are truncated with "..."

#### Scenario: Display on projects dashboard
- **WHEN** authenticated user views `/projects`
- **THEN** project cards display description
- **AND** descriptions are visible in project list

#### Scenario: Display on project detail page
- **WHEN** user views `/projects/{id}`
- **THEN** project detail page shows full description
- **AND** no truncation applied

### Requirement: Description stored in YAML format
The system SHALL persist project descriptions in the project.yaml file.

#### Scenario: YAML structure with description
- **WHEN** project is created with description
- **THEN** `project.yaml` contains:
  ```yaml
  id: abc-123
  name: my-project
  description: "A sample description"
  repoUrl: https://github.com/user/repo.git
  repoType: git
  owner: username
  createdAt: 2024-01-15T10:30:00Z
  ```

#### Scenario: YAML structure without description
- **WHEN** project is created without description
- **THEN** `project.yaml` does not include description field
- **AND** reading project returns description as undefined or null

#### Scenario: Backwards compatibility
- **WHEN** system reads existing project.yaml without description field
- **THEN** description is treated as undefined
- **AND** no migration or error occurs