## MODIFIED Requirements

### Requirement: Buffer Registration

Each buffer SHALL register with:

- `id`: Unique identifier (e.g., 'chat', 'impact', 'notes', 'review')
- `name`: Display name shown in tabs
- `frame`: 'left' or 'right' - which frame this buffer belongs to
- `component`: React component that renders the buffer content

The left-frame buffer registration order SHALL be: Chat, Terminal, Edit, Patches, Commit, Review.

#### Scenario: Left frame default buffer set

- **WHEN** default buffers are registered via `ensureDefaultBuffersRegistered`
- **THEN** the left frame SHALL include buffers in the order: Chat, Terminal, Edit, Patches, Commit, Review

#### Scenario: Review buffer registered with correct metadata

- **WHEN** `ensureDefaultBuffersRegistered` runs
- **THEN** a buffer with id `review`, name `Review`, frame `left` SHALL be registered with its component
- **AND** the Review buffer SHALL be positioned immediately after the `commit` buffer

### Requirement: Default State

New sessions SHALL have default frame state:

- Left frame: 'chat' active
- Right frame: 'impact' active

Buffer assignment SHALL default to:

- Left frame: Chat, Terminal, Edit, Patches, Commit, Review
- Right frame: Impact, Notes, FileTree

#### Scenario: New session left-frame buffers

- **WHEN** a new session is created
- **THEN** the left frame SHALL have the Chat buffer active by default
- **AND** the Review buffer SHALL be present as an inactive tab