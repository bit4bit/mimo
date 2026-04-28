## ADDED Requirements

### Requirement: Unified projects and sessions page
The system SHALL provide a single split-pane page at `/projects` that displays the project list on the left and the selected project's sessions on the right.

#### Scenario: Page loads with no project selected
- **WHEN** authenticated user navigates to `/projects`
- **THEN** system renders left panel with all user's projects
- **AND** system renders empty right panel (no sessions shown)

#### Scenario: Page loads with project selected
- **WHEN** authenticated user navigates to `/projects?selected=:projectId`
- **THEN** system renders left panel with all user's projects, selected project highlighted
- **AND** system renders right panel with selected project's metadata and sessions list

#### Scenario: User selects a project
- **WHEN** authenticated user clicks a project name in the left panel
- **THEN** browser navigates to `/projects?selected=:projectId` (full page reload)
- **AND** right panel shows that project's metadata and sessions

### Requirement: Project list shows edit and impact icons
The system SHALL display an edit icon and an impact history icon on each project row in the left panel.

#### Scenario: Edit icon navigates to project edit page
- **WHEN** authenticated user clicks the edit icon (✎) on a project row
- **THEN** browser navigates to `/projects/:id/edit`

#### Scenario: Impact icon navigates to impact history page
- **WHEN** authenticated user clicks the impact icon (📊) on a project row
- **THEN** browser navigates to `/projects/:id/impacts`

### Requirement: Right panel shows project metadata summary
The system SHALL display a compact metadata summary for the selected project at the top of the right panel.

#### Scenario: Metadata summary with credential
- **WHEN** authenticated user selects a project that has a credential configured
- **THEN** system displays repo type, repo URL, branch (if set), and credential name

#### Scenario: Metadata summary without credential
- **WHEN** authenticated user selects a project with no credential
- **THEN** system displays repo type, repo URL, branch (if set), and no credential indicator

### Requirement: Right panel shows sessions with search and new session action
The system SHALL display the selected project's sessions in the right panel with search capability and a button to create a new session.

#### Scenario: Sessions list with search
- **WHEN** authenticated user selects a project
- **THEN** system displays sessions sorted by priority then recency, with a search input filtering by name

#### Scenario: New session button
- **WHEN** authenticated user clicks `[+ New Session]` in the right panel
- **THEN** browser navigates to `/projects/:id/sessions/new`

### Requirement: Legacy project detail URL redirects to unified view
The system SHALL redirect `GET /projects/:id` to `GET /projects?selected=:id` so existing bookmarks and links continue to work.

#### Scenario: Project detail URL redirected
- **WHEN** any user navigates to `/projects/:id`
- **THEN** system responds with a redirect to `/projects?selected=:id`
