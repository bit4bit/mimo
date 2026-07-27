## MODIFIED Requirements

### Requirement: Buffer Registration

Each buffer SHALL register with:

- `id`: Unique identifier (e.g., 'chat', 'impact', 'notes')
- `name`: Display name shown in tabs
- `frame`: 'left' or 'right' - which frame this buffer belongs to
- `component`: React component that renders the buffer content

The left frame SHALL include the following buffers in registration order:
1. `chat` (Chat)
2. `terminal` (Terminal)
3. `edit` (Edit)
4. `patches` (Patches)

#### Scenario: Left frame tab order includes Terminal after Chat

- **WHEN** the session page renders the left frame tab bar
- **THEN** the tabs SHALL appear in order: Chat, Terminal, Edit, Patches
- **AND** the Terminal tab SHALL be positioned second

#### Scenario: Terminal buffer registered in left frame

- **WHEN** `ensureDefaultBuffersRegistered()` is called
- **THEN** a buffer with `id: "terminal"`, `name: "Terminal"`, `frame: "left"` SHALL be registered
- **AND** it SHALL be registered after the `chat` buffer and before the `edit` buffer