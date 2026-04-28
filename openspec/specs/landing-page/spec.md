## ADDED Requirements

### Requirement: Landing page shows platform description
The system SHALL display a landing page at the root path `/` that includes a description of the MIMO platform, its features, and purpose.

#### Scenario: User visits root path
- **WHEN** user navigates to `/`
- **THEN** system displays landing page with:
  - Platform title "MIMO - Minimal IDE for Modern Operations"
  - Platform description explaining Emacs-style interface, session-based development, AI integration
  - List of key features
  - Login and Register buttons in header

#### Scenario: Unauthenticated user views landing page
- **WHEN** unauthenticated user visits landing page
- **THEN** page displays Login and Register buttons
- **AND** no user-specific content is shown
- **AND** project list is visible

#### Scenario: Authenticated user views landing page
- **WHEN** authenticated user visits landing page
- **THEN** page displays username and Logout option
- **AND** project list is visible
- **AND** "Create Project" button is shown

### Requirement: Landing page displays public project list
The system SHALL show a list of all projects on the landing page without requiring authentication.

#### Scenario: Projects exist in system
- **WHEN** user visits landing page
- **AND** system has 5 projects
- **THEN** page displays 5 project cards
- **AND** each card shows project name, description, repo type, owner
- **AND** repo URLs are NOT displayed

#### Scenario: No projects in system
- **WHEN** user visits landing page
- **AND** system has 0 projects
- **THEN** page displays "No projects yet" message
- **AND** "Create your first project" button shown if authenticated

#### Scenario: Project has no description
- **WHEN** user views project card
- **AND** project has no description field
- **THEN** card displays muted "No description" text

#### Scenario: Project has description
- **WHEN** user views project card
- **AND** project has description "A web application for task management"
- **THEN** card displays full description
- **AND** description is truncated if longer than 200 characters

### Requirement: Landing page shows authentication CTAs
The system SHALL provide clear authentication call-to-action buttons on the landing page.

#### Scenario: Login button functionality
- **WHEN** user clicks Login button on landing page
- **THEN** system navigates to `/auth/login`

#### Scenario: Register button functionality
- **WHEN** user clicks Register button on landing page
- **THEN** system navigates to `/auth/register`

#### Scenario: Authenticated user sees logout
- **WHEN** authenticated user views landing page
- **THEN** page shows Logout button
- **AND** clicking Logout clears session and refreshes page

### Requirement: Clicking project navigates appropriately
The system SHALL handle project card clicks based on authentication status.

#### Scenario: Unauthenticated user clicks project
- **WHEN** unauthenticated user clicks project card
- **THEN** system redirects to `/auth/login?redirect=/projects/{id}`
- **AND** after login, user is redirected to `/projects/{id}`

#### Scenario: Authenticated user clicks project
- **WHEN** authenticated user clicks project card
- **THEN** system navigates directly to `/projects/{id}`
- **AND** displays full project details

### Requirement: Public project API endpoint
The system SHALL provide a public API endpoint for fetching project data.

#### Scenario: Fetch public projects
- **WHEN** client requests `GET /api/projects/public`
- **THEN** system returns JSON array with:
  - id (string)
  - name (string)
  - description (string or null)
  - repoType ("git" | "fossil")
  - owner (string)
  - createdAt (ISO 8601 date string)
- **AND** repoUrl is NOT included
- **AND** response uses 200 status code

#### Scenario: No projects exist
- **WHEN** client requests `GET /api/projects/public`
- **AND** system has 0 projects
- **THEN** system returns empty array `[]`
- **AND** response uses 200 status code

#### Scenario: Endpoint accessible without auth
- **WHEN** client requests `GET /api/projects/public` without authentication token
- **THEN** system returns public project data
- **AND** does not redirect to login page
- **AND** returns 200 status code