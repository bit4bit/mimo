## ADDED Requirements

### Requirement: User can create a project
The system SHALL allow authenticated users to create projects that can be linked to Git or Fossil repositories.

#### Scenario: Create project with Git repository
- **WHEN** authenticated user submits project name "my-app" and Git URL "https://github.com/user/repo.git"
- **THEN** system creates directory ~/.mimo/projects/my-app/
- **AND** system stores project.yaml with {name: "my-app", repos: [{type: "git", url: "..."}]}
- **AND** system redirects to session creation

#### Scenario: Create project with Fossil repository
- **WHEN** authenticated user submits project name "my-app" and Fossil URL "https://fossil.example.com/repo"
- **THEN** system creates directory ~/.mimo/projects/my-app/
- **AND** system stores project.yaml with {name: "my-app", repos: [{type: "fossil", url: "..."}]}

#### Scenario: Create project with multiple repositories
- **WHEN** authenticated user submits project name "my-app" with two repository URLs
- **THEN** system stores both repositories in project.yaml repos array

#### Scenario: Duplicate project name
- **WHEN** user submits project name that already exists
- **THEN** system returns error "Project name already exists"

### Requirement: User can list projects
The system SHALL display all projects owned by the authenticated user.

#### Scenario: List user projects
- **WHEN** authenticated user navigates to projects page
- **THEN** system displays list of all projects from ~/.mimo/projects/
- **AND** each project shows name and repository count

#### Scenario: Empty project list
- **WHEN** authenticated user with no projects navigates to projects page
- **THEN** system displays message "No projects yet. Create one?"

### Requirement: User can switch between projects
The system SHALL allow users to select a project and view its sessions.

#### Scenario: Switch to project
- **WHEN** user selects project from list
- **THEN** system loads project context
- **AND** system displays project's sessions

### Requirement: User can delete a project
The system SHALL allow users to remove projects and all associated sessions.

#### Scenario: Delete project with confirmation
- **WHEN** authenticated user confirms deletion of project "my-app"
- **THEN** system removes ~/.mimo/projects/my-app/ directory recursively
- **AND** system terminates any running agents for project's sessions
- **AND** system redirects to projects list
