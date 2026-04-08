## ADDED Requirements

### Requirement: Session status includes frozen state
The session status enum SHALL include `frozen` as a valid status value.

#### Scenario: Session created with active status
- **WHEN** a new session is created
- **THEN** the session status SHALL be set to `active`

#### Scenario: Session status can be set to frozen
- **GIVEN** a session with status `active`
- **WHEN** the session status is updated to `frozen`
- **THEN** the session status SHALL be `frozen`

### Requirement: Project freeze action marks all sessions as frozen
The system SHALL provide a project-level action that marks all sessions belonging to that project as `frozen`.

#### Scenario: Freeze project with multiple sessions
- **GIVEN** a project with 3 sessions (all with status `active`)
- **WHEN** the "Freeze Project" action is invoked
- **THEN** all 3 sessions SHALL have status `frozen`

#### Scenario: Freeze project with no sessions
- **GIVEN** a project with 0 sessions
- **WHEN** the "Freeze Project" action is invoked
- **THEN** no error SHALL occur

#### Scenario: Freeze project with mixed session statuses
- **GIVEN** a project with sessions having statuses `active`, `paused`, and `closed`
- **WHEN** the "Freeze Project" action is invoked
- **THEN** all sessions SHALL have status `frozen`

### Requirement: Chat messages blocked for frozen sessions
The system SHALL reject chat message requests for sessions with status `frozen`.

#### Scenario: Send message to frozen session
- **GIVEN** a session with status `frozen`
- **WHEN** a chat message is sent to that session
- **THEN** the system SHALL return an error indicating the session is frozen
- **AND** the message SHALL NOT be processed

#### Scenario: Send message to active session
- **GIVEN** a session with status `active`
- **WHEN** a chat message is sent to that session
- **THEN** the message SHALL be processed normally

### Requirement: Commits blocked for frozen sessions
The system SHALL reject commit requests for sessions with status `frozen`.

#### Scenario: Commit from frozen session
- **GIVEN** a session with status `frozen`
- **WHEN** a commit is attempted from that session
- **THEN** the system SHALL return an error indicating the session is frozen
- **AND** the commit SHALL NOT be executed

#### Scenario: Commit from active session
- **GIVEN** a session with status `active`
- **WHEN** a commit is attempted from that session
- **THEN** the commit SHALL be executed normally

### Requirement: Frozen status displayed in sessions list
The system SHALL display the `frozen` status in the sessions list.

#### Scenario: View sessions list with frozen session
- **GIVEN** a project with one session having status `frozen`
- **WHEN** the sessions list is viewed
- **THEN** the session SHALL display status as "frozen"

### Requirement: Freeze project button in UI
The system SHALL provide a "Freeze Project" button on the Project Detail page.

#### Scenario: Project detail page displays freeze button
- **GIVEN** a project exists
- **WHEN** the Project Detail page is viewed
- **THEN** a "Freeze Project" button SHALL be visible in the Actions section

#### Scenario: Click freeze button
- **GIVEN** the Project Detail page is displayed
- **WHEN** the "Freeze Project" button is clicked
- **THEN** all sessions for the project SHALL be marked as `frozen`
- **AND** the page SHALL reflect the updated statuses
