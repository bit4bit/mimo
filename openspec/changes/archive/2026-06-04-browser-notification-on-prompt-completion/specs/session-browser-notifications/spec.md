## ADDED Requirements

### Requirement: Session stores browser notification preference
The system SHALL persist a boolean `browserNotificationsEnabled` flag as part of each session's configuration.

#### Scenario: Session creation defaults to disabled
- **WHEN** a new session is created
- **THEN** the session's `browserNotificationsEnabled` is `false` by default

#### Scenario: Existing sessions without the field default to false
- **WHEN** a session is loaded from persistent storage and `browserNotificationsEnabled` is missing
- **THEN** the system treats it as `false`

#### Scenario: Patch endpoint updates the preference
- **WHEN** an authenticated PATCH request is sent to `/sessions/:id/config` with `browserNotificationsEnabled: true`
- **THEN** the preference is persisted in the session configuration file

#### Scenario: API exposes the preference
- **WHEN** a session detail API response is returned
- **THEN** the response includes `browserNotificationsEnabled` as a boolean

### Requirement: Settings page provides a notification toggle
The settings page SHALL render a form element allowing the user to enable or disable browser notifications for the current session.

#### Scenario: User enables notifications
- **WHEN** the user checks the "Browser notifications" checkbox in session settings
- **THEN** a PATCH request is sent to update the session configuration

#### Scenario: Settings reflect current state
- **WHEN** the settings page is loaded
- **THEN** the checkbox state matches the session's current `browserNotificationsEnabled` value

### Requirement: Frontend shows notification on prompt completion when enabled
The frontend SHALL display a browser notification when a `prompt_completed` WebSocket event is received, but only if the tab is hidden/unfocused and the session has notifications enabled.

#### Scenario: Prompt ends while tab is hidden and notifications enabled
- **WHEN** a `prompt_completed` event is received for the active session
- **AND** the session has `browserNotificationsEnabled` set to `true`
- **AND** `document.hidden` is `true` or the window lacks focus
- **THEN** a browser notification titled "Response ready" is shown

#### Scenario: Prompt ends while tab is visible
- **WHEN** a `prompt_completed` event is received for the active session
- **AND** the session has `browserNotificationsEnabled` set to `true`
- **AND** the tab is focused and visible
- **THEN** no notification is shown

#### Scenario: Prompt ends with notifications disabled
- **WHEN** a `prompt_completed` event is received for the active session
- **AND** the session has `browserNotificationsEnabled` set to `false`
- **THEN** no notification is shown regardless of tab visibility

#### Scenario: Clicking notification focuses the tab
- **WHEN** the user clicks a "Response ready" notification
- **THEN** the browser tab receives focus
- **AND** the notification is dismissed
