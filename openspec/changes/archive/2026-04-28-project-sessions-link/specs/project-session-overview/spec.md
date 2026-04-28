## ADDED Requirements

### Requirement: Project detail page displays sessions
The system SHALL display a list of all sessions for a project on the project detail page.

#### Scenario: View sessions for a project with sessions
- **WHEN** user navigates to project detail page
- **AND** project has 3 existing sessions
- **THEN** system displays all 3 sessions in a Sessions section
- **AND** each session shows session name
- **AND** each session shows creation date
- **AND** each session name is a clickable link to session detail

#### Scenario: View sessions for a project with no sessions
- **WHEN** user navigates to project detail page
- **AND** project has 0 sessions
- **THEN** system displays "No sessions yet. Create one to start development."
- **AND** system displays "New Session" button

#### Scenario: Session list ordered by recency
- **WHEN** user views session list on project page
- **THEN** sessions are displayed in descending order by creation date
- **AND** most recent session appears first

### Requirement: Project detail page provides session creation
The system SHALL provide a "New Session" button on the project detail page to create new sessions.

#### Scenario: Create new session from project page
- **WHEN** user clicks "New Session" button
- **THEN** system navigates to `/projects/{projectId}/sessions/new`
- **AND** session creation form is displayed

#### Scenario: New Session button always visible
- **WHEN** user views project detail page
- **THEN** "New Session" button is visible regardless of existing session count
- **AND** button is styled as primary action (filled background)

### Requirement: Session links navigate to session detail
The system SHALL allow users to navigate to session detail from the project page.

#### Scenario: Click session to view details
- **WHEN** user clicks on session name in the list
- **THEN** system navigates to `/projects/{projectId}/sessions/{sessionId}`
- **AND** session detail page is displayed with full session information

#### Scenario: Session detail maintains project context
- **WHEN** user navigates to session detail from project page
- **AND** clicks "Back" in browser
- **THEN** system returns to project detail page
- **AND** session list is preserved