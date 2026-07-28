# Spec: terminal-persistence

## Requirements

### Requirement: Terminal lifetime is independent of browser attachment

A terminal SHALL remain alive from spawn until one of: (a) the user explicitly deletes it, (b) its shell process exits on its own, or (c) the mimo-agent process hosting it stops. Closing, reloading, or disconnecting every browser client MUST NOT terminate the terminal process or mark the terminal dead.

#### Scenario: Browser reload keeps terminal alive

- **GIVEN** a session with a terminal in state `active` and a running shell process
- **WHEN** all browser clients disconnect (reload or close)
- **THEN** the terminal process SHALL continue running on the agent
- **AND** the terminal state SHALL remain `active`
- **AND** no kill signal SHALL be sent to the agent for that terminal

#### Scenario: Explicit delete terminates terminal

- **GIVEN** a session with a terminal in state `active`
- **WHEN** the user deletes the terminal via the API
- **THEN** the platform SHALL send `terminal_kill` to the assigned agent
- **AND** the terminal SHALL be removed from the session record

#### Scenario: Agent restart terminates terminals

- **GIVEN** a session with terminals hosted by a mimo-agent process
- **WHEN** that mimo-agent process stops
- **THEN** the terminal processes SHALL terminate with it
- **AND** this is accepted behavior (no re-spawn on agent restart)

### Requirement: Automatic re-attach on page load

When the terminal buffer initializes for a session that has terminals, the frontend SHALL automatically attach to a terminal without requiring the user to click a tab. Attaching SHALL create the xterm instance and open the terminal WebSocket, which triggers the server-side scrollback replay, leaving the terminal interactive.

#### Scenario: Reload restores the previously active terminal

- **GIVEN** a session with multiple terminals and the user had terminal B selected before reload
- **WHEN** the page loads
- **THEN** the frontend SHALL attach to terminal B
- **AND** the scrollback buffer SHALL be replayed into the xterm view
- **AND** keyboard input SHALL be forwarded to the terminal process

#### Scenario: Fallback to first active terminal

- **GIVEN** a session with terminals and no remembered selection (or the remembered terminal no longer exists or is `dead`)
- **WHEN** the page loads
- **THEN** the frontend SHALL attach to the first terminal with state `active`

#### Scenario: No attach when no terminals exist

- **GIVEN** a session with zero terminals
- **WHEN** the page loads
- **THEN** the frontend SHALL show the empty state
- **AND** no terminal WebSocket SHALL be opened

### Requirement: Active terminal selection is remembered per session

The frontend SHALL persist the id of the currently selected terminal, keyed by session, in browser `localStorage`, updating it on every tab switch and clearing it when the selected terminal is deleted.

#### Scenario: Selection stored on tab switch

- **GIVEN** a session with terminals A and B
- **WHEN** the user switches from terminal A to terminal B
- **THEN** the stored selection for that session SHALL be updated to B

#### Scenario: Selection cleared on delete of selected terminal

- **GIVEN** the stored selection for a session is terminal B
- **WHEN** terminal B is deleted
- **THEN** the stored selection SHALL be cleared
