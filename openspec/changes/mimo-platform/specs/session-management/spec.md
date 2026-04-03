## ADDED Requirements

### Requirement: User can create a session
The system SHALL allow users to create sessions within a project. Each session creates a worktree and starts a Fossil server.

#### Scenario: Create session with title
- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates directory ~/.mimo/projects/my-app/sessions/fix-auth-bug/
- **AND** system clones project's repository to repo.fossil
- **AND** system assigns auto-generated port (8000-9000 range)
- **AND** system starts Fossil server on assigned port
- **AND** system stores session.yaml with {title: "fix-auth-bug", port: <assigned>, status: "active"}
- **AND** system displays session view

#### Scenario: Port collision handling
- **WHEN** system attempts to start Fossil server on occupied port
- **THEN** system tries next available port in range
- **AND** system continues until successful

#### Scenario: Duplicate session title
- **WHEN** user submits session title that already exists in project
- **THEN** system appends timestamp to title or returns error

### Requirement: Session persists across disconnects
The system SHALL maintain session state when user disconnects.

#### Scenario: Reconnect to active session
- **WHEN** user reconnects to existing session
- **THEN** system loads chat history from messages.jsonl
- **AND** system reattaches to running agent if exists
- **AND** system displays current file tree state

#### Scenario: Agent running on reconnect
- **WHEN** user reconnects and agent is still running
- **THEN** system establishes WebSocket to agent
- **AND** system resumes chat stream

### Requirement: User can delete a session
The system SHALL allow users to remove sessions.

#### Scenario: Delete session with cleanup
- **WHEN** authenticated user deletes session "fix-auth-bug"
- **THEN** system terminates agent process if running
- **AND** system stops Fossil server
- **AND** system removes ~/.mimo/projects/my-app/sessions/fix-auth-bug/ directory

### Requirement: Chat messages are stored persistently
The system SHALL store chat history in append-only JSONL format.

#### Scenario: Store user message
- **WHEN** user sends message "Add dark mode"
- **THEN** system appends to messages.jsonl: {type: "user", content: "Add dark mode", timestamp: "..."}

#### Scenario: Store agent message
- **WHEN** agent sends response "I'll help with that..."
- **THEN** system appends to messages.jsonl: {type: "agent", content: "...", timestamp: "..."}

#### Scenario: Stream agent response
- **WHEN** agent streams response in chunks
- **THEN** system buffers and stores complete message on finish
- **AND** system displays streaming updates via WebSocket

### Requirement: Session shows file tree with change indicators
The system SHALL display project file tree with modification markers in the left buffer.

#### Scenario: Show modified files
- **WHEN** agent reports file changes
- **THEN** system marks files with [M] in file tree (left buffer)
- **AND** system updates changes buffer (right buffer)

#### Scenario: Show new files
- **WHEN** agent creates new files
- **THEN** system marks files with [?] in file tree (left buffer)

### Requirement: Session shows file diffs with syntax highlighting
The system SHALL display file changes with language-appropriate syntax highlighting.

#### Scenario: View file diff
- **WHEN** user clicks on modified file
- **THEN** system displays diff with syntax highlighting
- **AND** system shows line additions and deletions

### Requirement: User can navigate file tree
The system SHALL allow users to browse and open files.

#### Scenario: Find file
- **WHEN** user presses the configured keybinding for find_file
- **THEN** system prompts for file path
- **AND** system opens file in file buffer

#### Scenario: Click file in tree
- **WHEN** user clicks file in file tree
- **THEN** system loads file content into file buffer

### Requirement: Keybindings are configurable
The system SHALL allow users to customize keybindings stored in ~/.mimo/config.yaml.

#### Scenario: Load custom keybindings
- **WHEN** user starts platform
- **THEN** system reads ~/.mimo/config.yaml
- **AND** system loads custom keybindings if defined
- **AND** system uses defaults for missing bindings

#### Scenario: Use default keybinding
- **WHEN** user presses C-c C-c (default cancel)
- **THEN** system executes cancel agent command
- **AND** keybinding is configurable via config.yaml

#### Scenario: Focus buffer with keybinding
- **WHEN** user presses C-x h
- **THEN** system focuses file buffer (left)
- **AND** system updates active buffer indicator

#### Scenario: Focus chat buffer
- **WHEN** user presses C-x j
- **THEN** system focuses chat buffer (center)
- **AND** system updates active buffer indicator

#### Scenario: Focus changes buffer
- **WHEN** user presses C-x l
- **THEN** system focuses changes buffer (right)
- **AND** system updates active buffer indicator
