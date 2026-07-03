## MODIFIED Requirements

### Requirement: Buffer Registration

Each buffer SHALL register with:

- `id`: Unique identifier (e.g., 'chat', 'impact', 'notes', 'file-tree')
- `name`: Display name shown in tabs
- `frame`: 'left' or 'right' - which frame this buffer belongs to
- `component`: React component that renders the buffer content

The right-frame buffer registration order SHALL be: Notes, FileTree, Impact, Summary, MCP, Plan.

#### Scenario: Right frame default buffer set
- **WHEN** default buffers are registered via `ensureDefaultBuffersRegistered`
- **THEN** the right frame SHALL include buffers in the order: Notes, FileTree, Impact, Summary, MCP, Plan

#### Scenario: FileTree buffer registered with correct metadata
- **WHEN** `ensureDefaultBuffersRegistered` runs
- **THEN** a buffer with id `file-tree`, name `Files`, frame `right` SHALL be registered with its component

### Requirement: Default State

New sessions SHALL have default frame state:

- Left frame: 'chat' active
- Right frame: 'impact' active

Buffer assignment SHALL default to:

- Left frame: Chat
- Right frame: Impact, Notes, FileTree

#### Scenario: New session right-frame buffers
- **WHEN** a new session is created
- **THEN** the right frame SHALL have the Impact buffer active by default
- **AND** the FileTree buffer SHALL be present as an inactive tab