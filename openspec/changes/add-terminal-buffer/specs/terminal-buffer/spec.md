## ADDED Requirements

### Requirement: Terminal buffer registered in left frame

The system SHALL register a "Terminal" buffer in the left frame, positioned immediately after the "Chat" buffer and before the "Edit" buffer in the tab order.

#### Scenario: Terminal tab appears after Chat

- **WHEN** the session page renders the left frame tab bar
- **THEN** the tab order SHALL be: Chat, Terminal, Edit, Patches
- **AND** the Terminal tab SHALL display the label "Terminal"

#### Scenario: Terminal buffer registered with correct frame

- **WHEN** the buffer registry is initialized via `ensureDefaultBuffersRegistered()`
- **THEN** a buffer with `id: "terminal"`, `name: "Terminal"`, `frame: "left"` SHALL be registered
- **AND** the registration order SHALL place it after the `chat` buffer and before the `edit` buffer

### Requirement: Terminal buffer receives terminal data as props

The `SessionDetailPage` SHALL pass the session's terminal list and active terminal id as buffer props to the Terminal buffer.

#### Scenario: Buffer props include terminals

- **WHEN** the session page renders with terminals persisted for the session
- **THEN** the Terminal buffer SHALL receive `terminals: Terminal[]` and `activeTerminalId: string | undefined` as buffer props

### Requirement: Terminal buffer displays tab-based terminal selector

The Terminal buffer SHALL display a tab bar at the top (matching the Chat buffer pattern) with a `+` button for creating new terminals and one tab per existing terminal. A context bar below the tabs SHALL show the active terminal's name, subpath (if set), scrollback, and a Delete button.

#### Scenario: Tab bar shows + button and terminal tabs

- **WHEN** the Terminal buffer is active and the session has terminals
- **THEN** the buffer SHALL render a tab bar with a `+` button (id `create-terminal-btn`)
- **AND** one tab per terminal showing the terminal name with a status indicator (🟢 active, 🔴 dead)
- **AND** the active terminal's tab SHALL be visually distinguished

#### Scenario: Context bar shows active terminal info

- **WHEN** the Terminal buffer is active and a terminal is selected
- **THEN** the context bar SHALL show the terminal name
- **AND** the context bar SHALL show the subpath if set
- **AND** the context bar SHALL show the scrollback value
- **AND** a Delete button SHALL be visible in the context bar

#### Scenario: No active terminal shows prompt

- **WHEN** the Terminal buffer is active and no terminals exist
- **THEN** the context bar SHALL display "No active terminal. Use + to get started."

### Requirement: Terminal buffer renders xterm.js container

The Terminal buffer SHALL render a container div that the `terminal.js` client module initializes as an xterm.js terminal instance.

#### Scenario: xterm container present in DOM

- **WHEN** the Terminal buffer is active and a terminal is selected
- **THEN** a container div with id `terminal-xterm-container` SHALL be present in the DOM
- **AND** the `terminal.js` module SHALL initialize an xterm.js instance in that container

### Requirement: Terminal buffer includes xterm.js assets

The system SHALL include xterm.js and required addons as static vendor assets, embedded in the compiled binary via `assets.ts`.

#### Scenario: xterm.js bundled as static asset

- **WHEN** the platform serves static assets
- **THEN** xterm.js core (`@xterm/xterm`) SHALL be available at `/vendor/xterm/xterm.js`
- **AND** xterm.js fit addon SHALL be available at `/vendor/xterm/addon-fit.js`
- **AND** xterm.js CSS SHALL be available at `/vendor/xterm/xterm.css`

#### Scenario: xterm assets embedded in compiled binary

- **WHEN** the platform runs as a compiled binary
- **THEN** the xterm.js assets SHALL be embedded via `Bun.embeddedFiles` and served from memory
- **AND** `assets.ts` SHALL import the xterm.js files with `with { type: "file" }`