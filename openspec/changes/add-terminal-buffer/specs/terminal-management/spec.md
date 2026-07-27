## ADDED Requirements

### Requirement: Terminal entity model

The system SHALL persist terminals as a collection on the session, stored in `session.yaml` alongside chat threads. Each terminal SHALL have:

- `id`: unique identifier (UUID or nanoid)
- `name`: user-provided display name
- `assignedAgentId`: the mimo-agent instance selected by the user when creating the terminal; the shell process SHALL be executed by this agent
- `command`: the command to execute in the terminal; defaults to `/bin/sh` when not specified
- `subpath`: optional working directory relative to the session's checkout root; when omitted, the shell runs at the checkout root
- `scrollback`: integer specifying the xterm.js scrollback buffer size (number of lines retained in memory)
- `cols`: integer specifying the terminal width in columns; defaults to 80 when not specified
- `rows`: integer specifying the terminal height in rows; defaults to 24 when not specified
- `state`: `"active"` or `"dead"`
- `createdAt`: ISO timestamp

#### Scenario: Terminal persisted in session.yaml

- **WHEN** a user creates a terminal named "build-shell" assigned to agent "agent-01" with subpath "packages/backend" and scrollback 5000
- **THEN** the system SHALL store a new `Terminal` entry in `session.yaml` under the `terminals` collection
- **AND** the entry SHALL contain `id`, `name: "build-shell"`, `assignedAgentId: "agent-01"`, `command: "/bin/sh"`, `subpath: "packages/backend"`, `scrollback: 5000`, `state: "active"`, and a `createdAt` timestamp

#### Scenario: Terminal with custom command

- **WHEN** a user creates a terminal with `command` set to `"bash -l"`
- **THEN** the terminal's `command` field SHALL be `"bash -l"`
- **AND** the agent SHALL spawn the shell using `"bash -l"` as the command

#### Scenario: Terminal without command defaults to /bin/sh

- **WHEN** a user creates a terminal without specifying a command
- **THEN** the terminal's `command` field SHALL be `"/bin/sh"`
- **AND** the agent SHALL spawn `/bin/sh`

#### Scenario: Terminal without subpath defaults to checkout root

- **WHEN** a user creates a terminal without specifying a subpath
- **THEN** the terminal's `subpath` field SHALL be omitted (or set to `undefined`)
- **AND** the shell process SHALL be spawned with cwd equal to the session's checkout root

### Requirement: Create terminal via API

The system SHALL expose an internal API endpoint to create a terminal for a session. The user SHALL select which online mimo-agent executes the terminal shell.

#### Scenario: Create terminal successfully

- **WHEN** a `POST /sessions/:id/terminals` request is made with `{ name, assignedAgentId, subpath?, scrollback, command?, cols?, rows? }`
- **THEN** the system SHALL validate that `name` is non-empty
- **AND** the system SHALL validate that `assignedAgentId` refers to an online agent
- **AND** the system SHALL validate that `scrollback` is a positive integer
- **AND** the system SHALL validate that `cols` and `rows`, when provided, are positive integers
- **AND** the system SHALL default `command` to `"/bin/sh"` when not provided
- **AND** the system SHALL default `cols` to `80` and `rows` to `24` when not provided
- **AND** the system SHALL create a new `Terminal` with `state: "active"` and the user-selected `assignedAgentId`
- **AND** the system SHALL persist it in `session.yaml`
- **AND** the system SHALL send a `terminal_spawn` message to the selected agent including the `command`, `cols`, and `rows`
- **AND** the response SHALL return the created terminal object with HTTP 200

#### Scenario: Create terminal with invalid size

- **WHEN** a `POST /sessions/:id/terminals` request is made with `cols` or `rows` that are not positive integers
- **THEN** the system SHALL return HTTP 400 with an error message indicating the invalid field

#### Scenario: Create terminal with missing required fields

- **WHEN** a `POST /sessions/:id/terminals` request is made without `name` or `assignedAgentId`
- **THEN** the system SHALL return HTTP 400 with an error message indicating the missing field

#### Scenario: Create terminal with offline agent

- **WHEN** a `POST /sessions/:id/terminals` request is made with an `assignedAgentId` that is not currently online
- **THEN** the system SHALL return HTTP 400 with an error message indicating the agent is not available

### Requirement: Terminal executed by selected mimo-agent

The terminal shell process SHALL be spawned by the mimo-agent selected by the user. The platform SHALL send a `terminal_spawn` message to the selected agent, and the agent SHALL spawn and manage the shell process lifecycle.

#### Scenario: Shell spawned on the selected agent

- **WHEN** a terminal is created with `assignedAgentId` set to agent "agent-01"
- **THEN** the platform SHALL send `{ type: "terminal_spawn", sessionId, terminalId, subpath, scrollback, cols, rows, command }` to agent "agent-01"
- **AND** agent "agent-01" SHALL spawn the shell process at the session's checkout path (plus optional subpath)
- **AND** the agent SHALL set the shell's terminal size to the given `cols` and `rows` at spawn time
- **AND** the shell process SHALL run on the agent's machine, not the platform

### Requirement: List terminals for a session

The system SHALL expose an internal API endpoint to list all terminals for a session.

#### Scenario: List terminals

- **WHEN** a `GET /sessions/:id/terminals` request is made
- **THEN** the system SHALL return all terminals persisted for that session
- **AND** each terminal SHALL include `id`, `name`, `assignedAgentId`, `subpath`, `scrollback`, `state`, `createdAt`

### Requirement: Delete terminal via API

The system SHALL expose an internal API endpoint to delete a terminal, which SHALL also kill the underlying shell process on the agent.

#### Scenario: Delete terminal successfully

- **WHEN** a `DELETE /sessions/:id/terminals/:terminalId` request is made
- **THEN** the system SHALL remove the terminal from `session.yaml`
- **AND** the system SHALL send a `terminal_kill` message to the agent hosting that terminal
- **AND** the response SHALL return HTTP 200

#### Scenario: Delete non-existent terminal

- **WHEN** a `DELETE /sessions/:id/terminals/:terminalId` request is made for a terminalId that does not exist
- **THEN** the system SHALL return HTTP 404

### Requirement: Terminal deletion forwarded to agent

When a terminal is deleted, the platform SHALL notify the agent to kill the shell process.

#### Scenario: Agent receives terminal kill

- **WHEN** the platform deletes a terminal with `assignedAgentId` set to agent "agent-01"
- **THEN** the platform SHALL send `{ type: "terminal_kill", terminalId }` to agent "agent-01" over the agent WebSocket
- **AND** the agent SHALL kill the corresponding shell process

### Requirement: Terminal deletion button in context bar

The Terminal buffer context bar SHALL include a Delete button that removes the active terminal and kills the underlying shell process.

#### Scenario: Delete button removes terminal

- **WHEN** the user clicks the Delete button in the terminal context bar
- **THEN** a confirmation dialog SHALL appear
- **AND** upon confirmation, a DELETE request SHALL be sent to `/sessions/:id/terminals/:terminalId`
- **AND** the terminal tab SHALL be removed from the tab bar
- **AND** the xterm.js instance SHALL be disposed

### Requirement: New terminal creation dialog

The system SHALL provide a UI dialog for creating a new terminal, prompting for: name, agent (selected from online agents), command (defaults to `/bin/sh`), optional subpath, scrollback length, and terminal size (columns and rows).

#### Scenario: Dialog presents online agents

- **WHEN** the user opens the "New Terminal" dialog
- **THEN** the agent selector SHALL be populated with currently online agents only
- **AND** the agent selector SHALL not allow selecting "None" (an agent is required)

#### Scenario: Dialog defaults command to /bin/sh

- **WHEN** the user opens the "New Terminal" dialog
- **THEN** the command field SHALL default to `/bin/sh`

#### Scenario: Dialog defaults scrollback

- **WHEN** the user opens the "New Terminal" dialog
- **THEN** the scrollback field SHALL default to `1000`

#### Scenario: Dialog defaults cols/rows to the current buffer size

- **WHEN** the user opens the "New Terminal" dialog
- **THEN** the columns and rows fields SHALL be prefilled with the dimensions that fit the current xterm container (via the xterm.js fit addon)
- **AND** when no fit dimensions are available, the fields SHALL default to `80` columns and `24` rows

#### Scenario: Dialog validates required fields

- **WHEN** the user clicks "Create" without entering a name or selecting an agent
- **THEN** the dialog SHALL show a validation error and not submit