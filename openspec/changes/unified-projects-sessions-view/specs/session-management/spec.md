## MODIFIED Requirements

### Requirement: User can delete a session
The system SHALL allow users to remove sessions. After deletion the system SHALL redirect to the unified projects/sessions page with the originating project selected.

#### Scenario: Delete session with cleanup
- **WHEN** authenticated user deletes session "fix-auth-bug" belonging to project `:projectId`
- **THEN** system terminates agent process if running
- **AND** system stops Fossil server if running
- **AND** system removes entire session directory including checkout/ and repo.fossil
- **AND** system redirects to `/projects?selected=:projectId`

## ADDED Requirements

### Requirement: Session detail back navigation returns to unified view
The system SHALL configure the session detail page's back button to return to the unified projects/sessions page with the originating project selected.

#### Scenario: Back button from session detail
- **WHEN** authenticated user is viewing session detail at `/projects/:projectId/sessions/:id`
- **THEN** the back button links to `/projects?selected=:projectId`

#### Scenario: Close session redirects to unified view
- **WHEN** authenticated user closes a session via the close action
- **THEN** system redirects to `/projects/:projectId/sessions/:id` (session detail, unchanged)
