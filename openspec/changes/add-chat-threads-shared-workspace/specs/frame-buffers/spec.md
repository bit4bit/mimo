## MODIFIED Requirements

### Requirement: Left frame supports chat-thread tabs
The left frame SHALL render one tab per chat thread for the current session.

#### Scenario: Session with multiple threads
- **WHEN** session has `Main`, `Reviewer`, and `Planner` threads
- **THEN** left frame tab bar shows three chat-thread tabs
- **AND** active tab corresponds to `activeChatThreadId`

### Requirement: Switching tabs switches active chat thread
The system SHALL switch active chat thread when user clicks a chat-thread tab.

#### Scenario: Activate reviewer thread
- **WHEN** user clicks `Reviewer` tab
- **THEN** system sets `activeChatThreadId` to reviewer thread ID
- **AND** chat panel renders reviewer history and current stream state

### Requirement: Create thread from session UI
The left frame SHALL provide an action to create a new chat thread with model and mode.

#### Scenario: Create thread from tab bar
- **WHEN** user creates thread with `{name: "Bug Hunter", model: "gpt-5", mode: "review"}`
- **THEN** system creates thread via chat-thread API
- **AND** tab bar updates with new thread
- **AND** new thread becomes active
