## ADDED Requirements

### Requirement: Browser WebSocket connection for terminal data

The system SHALL provide a WebSocket endpoint at `/ws/terminal/:sessionId/:terminalId` for bidirectional terminal data streaming between browser and platform. This connection SHALL be cookie-authenticated, same as the chat and files WebSocket connections.

#### Scenario: Browser connects to terminal WebSocket

- **WHEN** the browser opens a WebSocket to `/ws/terminal/:sessionId/:terminalId` with a valid session cookie
- **THEN** the platform SHALL accept the connection
- **AND** the platform SHALL verify the session exists and the user owns it

#### Scenario: Unauthenticated terminal WebSocket rejected

- **WHEN** the browser opens a WebSocket to `/ws/terminal/:sessionId/:terminalId` without a valid cookie token
- **THEN** the platform SHALL reject the connection with HTTP 401

#### Scenario: Non-owner rejected

- **WHEN** the browser opens a WebSocket to `/ws/terminal/:sessionId/:terminalId` with a valid token for a user who does not own the session
- **THEN** the platform SHALL reject the connection with HTTP 401

### Requirement: Platform bridges terminal data to agent

The platform SHALL relay terminal stdin from the browser WebSocket to the agent WebSocket, and terminal stdout from the agent WebSocket back to the browser WebSocket.

#### Scenario: Browser stdin forwarded to agent

- **WHEN** the browser sends a binary frame containing stdin data over `/ws/terminal/:sessionId/:terminalId`
- **THEN** the platform SHALL send `{ type: "terminal_input", sessionId, terminalId, data: "<base64>" }` to the agent hosting that terminal over the agent WebSocket

#### Scenario: Agent stdout forwarded to browser

- **WHEN** the agent sends `{ type: "terminal_output", sessionId, terminalId, data: "<base64>" }` to the platform
- **THEN** the platform SHALL decode the base64 data and send it as a binary frame to the browser WebSocket connected to that terminal

### Requirement: Agent spawns shell on terminal_spawn

The agent SHALL spawn a shell process when it receives a `terminal_spawn` message from the platform. The command to execute SHALL be provided in the message; when not present, the agent SHALL default to `/bin/sh`.

#### Scenario: Agent spawns shell at checkout root

- **WHEN** the agent receives `{ type: "terminal_spawn", sessionId, terminalId, subpath: undefined, scrollback: 1000, command: "bash -l" }`
- **THEN** the agent SHALL spawn a shell process with cwd equal to the session's checkout root
- **AND** the shell command SHALL be `"bash -l"` (parsed as `bash` with arg `-l`)
- **AND** the agent SHALL stream stdout from the shell process back as `terminal_output` messages

#### Scenario: Agent spawns shell with subpath

- **WHEN** the agent receives `{ type: "terminal_spawn", sessionId, terminalId, subpath: "packages/backend", scrollback: 5000, command: "/bin/sh" }`
- **THEN** the agent SHALL spawn a shell process with cwd equal to `{checkoutPath}/packages/backend`
- **AND** the shell command SHALL be `/bin/sh`

#### Scenario: Agent spawns shell with default command when command not provided

- **WHEN** the agent receives `{ type: "terminal_spawn", sessionId, terminalId, subpath: undefined, scrollback: 1000 }` (no `command` field)
- **THEN** the agent SHALL spawn `/bin/sh`

#### Scenario: Agent sends terminal_spawned confirmation

- **WHEN** the agent successfully spawns the shell process for a terminal
- **THEN** the agent SHALL send `{ type: "terminal_spawned", sessionId, terminalId }` back to the platform

#### Scenario: Agent handles terminal_input

- **WHEN** the agent receives `{ type: "terminal_input", sessionId, terminalId, data: "<base64>" }`
- **THEN** the agent SHALL decode the base64 data and write it to the shell process's stdin

### Requirement: Agent streams shell stdout to platform

The agent SHALL stream the shell process's stdout to the platform as `terminal_output` messages.

#### Scenario: Continuous stdout streaming

- **WHEN** the shell process produces output on stdout
- **THEN** the agent SHALL send `{ type: "terminal_output", sessionId, terminalId, data: "<base64>" }` to the platform
- **AND** the data SHALL be the base64-encoded raw stdout bytes

### Requirement: Agent handles terminal_kill

The agent SHALL kill the shell process when it receives a `terminal_kill` message.

#### Scenario: Kill terminates shell process

- **WHEN** the agent receives `{ type: "terminal_kill", sessionId, terminalId }`
- **THEN** the agent SHALL kill the shell process associated with that terminal
- **AND** the agent SHALL send `{ type: "terminal_exited", sessionId, terminalId, exitCode }` to the platform

### Requirement: Agent reports terminal exit

The agent SHALL notify the platform when a shell process exits, whether by kill or natural termination.

#### Scenario: Shell exits naturally

- **WHEN** the shell process exits on its own (e.g. user types `exit`)
- **THEN** the agent SHALL send `{ type: "terminal_exited", sessionId, terminalId, exitCode }` to the platform
- **AND** the platform SHALL update the terminal's state to `"dead"` in `session.yaml`
- **AND** the platform SHALL notify the browser WebSocket of the exit

### Requirement: Platform notifies browser of terminal exit

The platform SHALL notify the browser when a terminal's shell process exits.

#### Scenario: Browser receives terminal exit

- **WHEN** the agent sends `terminal_exited` for a terminal
- **THEN** the platform SHALL send `{ type: "terminal_exited", terminalId, exitCode }` to the browser WebSocket for that terminal
- **AND** the browser SHALL close the xterm.js connection and display the exit status

### Requirement: Terminal spawn on creation

The platform SHALL send a `terminal_spawn` message to the user-selected agent when a terminal is created. The shell process SHALL be spawned and managed by that mimo-agent.

#### Scenario: Spawn message sent to the selected agent on terminal creation

- **WHEN** a terminal is created via the API with `assignedAgentId` set to agent "agent-01" (user-selected, online) and `command` set to `"bash -l"`
- **THEN** the platform SHALL send `{ type: "terminal_spawn", sessionId, terminalId, subpath, scrollback, command }` to agent "agent-01"
- **AND** agent "agent-01" SHALL spawn the shell process using the provided command at the session's checkout path (plus optional subpath)
- **AND** the shell process SHALL run on the agent's machine, not the platform

### Requirement: Terminal kill on deletion

The platform SHALL send a `terminal_kill` message to the agent when a terminal is deleted.

#### Scenario: Kill message sent on terminal deletion

- **WHEN** a terminal is deleted via the API
- **THEN** the platform SHALL send `{ type: "terminal_kill", sessionId, terminalId }` to the agent hosting that terminal
- **AND** the agent SHALL kill the shell process

### Requirement: xterm.js rendering with scrollback

The browser SHALL render terminal output using xterm.js with configurable scrollback.

#### Scenario: xterm initialized with scrollback

- **WHEN** the Terminal buffer becomes active and a terminal exists
- **THEN** the browser SHALL initialize an xterm.js `Terminal` instance with `scrollback` set to the terminal's configured scrollback value
- **AND** the terminal SHALL be attached to the DOM container in the Terminal buffer

#### Scenario: User can scroll through history

- **WHEN** the user scrolls up within the xterm.js terminal
- **THEN** the terminal SHALL display previously output lines up to the scrollback limit
- **AND** lines beyond the scrollback limit SHALL be discarded

#### Scenario: xterm writes incoming data

- **WHEN** the browser receives a binary frame from the terminal WebSocket
- **THEN** the browser SHALL write the data to the xterm.js instance via `terminal.write()`

#### Scenario: xterm sends user input

- **WHEN** the user types into the xterm.js terminal
- **THEN** the browser SHALL send the typed data as a binary frame over the terminal WebSocket