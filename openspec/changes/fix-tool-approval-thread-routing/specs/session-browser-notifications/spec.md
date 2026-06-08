## MODIFIED Requirements

### Requirement: Frontend shows notification on prompt completion when enabled

The frontend SHALL display a browser notification when a `prompt_completed` WebSocket event is received, but only if the tab is hidden/unfocused and the session has notifications enabled. The frontend SHALL also display a browser notification when a `permission_request` arrives for a non-active chat thread and the session has notifications enabled.

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

#### Scenario: Tool approval needed on non-active thread with notifications enabled

- **WHEN** a `permission_request` event is received for a chat thread that is not the currently active thread
- **AND** the session has `browserNotificationsEnabled` set to `true`
- **THEN** a browser notification SHALL be shown indicating which thread needs approval
- **AND** clicking the notification SHALL switch the UI to the requesting thread and focus the tab

#### Scenario: Tool approval needed on non-active thread with notifications disabled

- **WHEN** a `permission_request` event is received for a non-active thread
- **AND** the session has `browserNotificationsEnabled` set to `false`
- **THEN** no browser notification SHALL be shown