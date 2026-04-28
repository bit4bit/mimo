## ADDED Requirements

### Requirement: Global session finder dialog
The system SHALL provide a globally accessible keyboard-triggered dialog that allows users to search and navigate to any session from any page.

#### Scenario: Open finder with keybinding
- **WHEN** user presses the configured `openSessionFinder` keybinding (default `Control+Shift+S`) on any page
- **THEN** system displays the session finder dialog with focus on the text input

#### Scenario: Close finder with Escape
- **WHEN** session finder dialog is open
- **AND** user presses Escape
- **THEN** system hides the dialog and clears the input

#### Scenario: Click outside closes dialog
- **WHEN** session finder dialog is open
- **AND** user clicks outside the dialog content area
- **THEN** system hides the dialog

### Requirement: Session finder shows recent sessions on open
The system SHALL display the user's most recently active sessions when the finder is opened with no query.

#### Scenario: Recent sessions on open
- **WHEN** user opens the session finder dialog with empty input
- **THEN** system fetches and displays up to 10 sessions sorted by last activity descending
- **AND** each result shows session name, project name, and session status

#### Scenario: No sessions exist
- **WHEN** user opens the session finder dialog
- **AND** the user has no sessions
- **THEN** system displays an empty state message

### Requirement: Session finder filters by query
The system SHALL filter sessions by substring match on session name or project name as the user types.

#### Scenario: Filter by session name
- **WHEN** user types a query that matches part of a session name
- **THEN** system displays only sessions whose name contains the query (case-insensitive)

#### Scenario: Filter by project name
- **WHEN** user types a query that matches part of a project name
- **THEN** system displays sessions belonging to that project (case-insensitive)

#### Scenario: No results
- **WHEN** user types a query that matches no session or project name
- **THEN** system displays a "no results" message

#### Scenario: Query debounced
- **WHEN** user types multiple characters rapidly
- **THEN** system waits 200ms after last keystroke before fetching

### Requirement: Session finder keyboard navigation
The system SHALL allow full keyboard navigation within the session finder results.

#### Scenario: Tab cycles forward
- **WHEN** session finder has results displayed
- **AND** user presses Tab
- **THEN** system moves highlight to the next result (wraps to first at end)

#### Scenario: Shift+Tab cycles backward
- **WHEN** session finder has results displayed
- **AND** user presses Shift+Tab
- **THEN** system moves highlight to the previous result (wraps to last at start)

#### Scenario: Enter opens highlighted session
- **WHEN** a result is highlighted in the session finder
- **AND** user presses Enter
- **THEN** system navigates to `/projects/:projectId/sessions/:sessionId` in a named window target `session-{sessionId}`
- **AND** dialog closes

#### Scenario: Enter with no highlight
- **WHEN** no result is highlighted in the session finder
- **AND** user presses Enter
- **THEN** system takes no navigation action

### Requirement: Session finder keybinding is configurable
The system SHALL allow the `openSessionFinder` keybinding to be overridden via YAML configuration.

#### Scenario: Custom keybinding applied
- **WHEN** user sets `globalKeybindings.openSessionFinder` in config YAML
- **THEN** system uses the configured key combination to open the session finder instead of the default
