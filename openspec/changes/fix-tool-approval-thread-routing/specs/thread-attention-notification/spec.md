## ADDED Requirements

### Requirement: Browser notification when non-active thread needs tool approval

The system SHALL display a browser notification when a `permission_request` arrives for a chat thread that is not currently active in the UI.

#### Scenario: Tool approval needed on non-active thread while viewing another thread

- **WHEN** a `permission_request` WebSocket message is received with a `chatThreadId` that does not match the currently active thread
- **AND** the session has `browserNotificationsEnabled` set to `true`
- **THEN** the system SHALL display a browser notification indicating which thread needs approval
- **AND** the notification SHALL include the thread name or identifier

#### Scenario: Tool approval needed on non-active thread with notifications disabled

- **WHEN** a `permission_request` WebSocket message is received for a non-active thread
- **AND** the session has `browserNotificationsEnabled` set to `false`
- **THEN** no browser notification SHALL be shown

#### Scenario: Clicking notification switches to the requesting thread

- **WHEN** the user clicks a thread-attention notification
- **THEN** the browser tab SHALL receive focus
- **AND** the UI SHALL switch to the chat thread that originated the `permission_request`

#### Scenario: Tool approval needed on the active thread

- **WHEN** a `permission_request` arrives for the currently active chat thread
- **THEN** no browser notification SHALL be shown
- **AND** the approval card SHALL render inline in the active thread's message stream

#### Scenario: Browser notification permission not granted

- **WHEN** a `permission_request` arrives for a non-active thread
- **AND** the browser has not granted notification permission
- **THEN** the system SHALL not throw an error
- **AND** the approval card SHALL still render in the correct thread's history when the user switches to it