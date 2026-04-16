## ADDED Requirements

### Requirement: Session keyboard profile
The system SHALL provide a default browser-safe keyboard profile on the session page.

#### Scenario: Default keymap availability
- **WHEN** a user loads a session page
- **THEN** the system registers the default key actions:
  - `Mod+Shift+/` for shortcuts help
  - `Mod+Shift+ArrowRight` for next thread
  - `Mod+Shift+ArrowLeft` for previous thread
  - `Mod+Shift+N` for create thread
  - `Mod+Shift+M` for commit dialog
  - `Mod+Shift+,` for Project Notes focus
  - `Mod+Shift+.` for Session Notes focus

### Requirement: Thread keyboard actions
The system SHALL allow thread management by keyboard.

#### Scenario: Create thread from keyboard
- **WHEN** the user presses `Mod+Shift+N`
- **THEN** the create-thread dialog opens as if `+ New Thread` was clicked

#### Scenario: Move between threads
- **WHEN** the user presses `Mod+Shift+ArrowRight`
- **THEN** the next available thread becomes active
- **AND** chat history switches to the selected thread

#### Scenario: Move to previous thread
- **WHEN** the user presses `Mod+Shift+ArrowLeft`
- **THEN** the previous available thread becomes active
- **AND** chat history switches to the selected thread

### Requirement: Commit and notes keyboard actions
The system SHALL expose commit and notes-focus actions by keyboard.

#### Scenario: Open commit dialog from keyboard
- **WHEN** the user presses `Mod+Shift+M`
- **THEN** the commit dialog opens as if Commit button was clicked

#### Scenario: Focus project notes from keyboard
- **WHEN** the user presses `Mod+Shift+,`
- **THEN** focus moves to Project Notes textarea
- **AND** cursor is placed in that textarea

#### Scenario: Focus session notes from keyboard
- **WHEN** the user presses `Mod+Shift+.`
- **THEN** focus moves to Session Notes textarea
- **AND** cursor is placed in that textarea

### Requirement: Keyboard help and auto-help
The system SHALL provide manual and automatic keyboard help for session actions.

#### Scenario: Open help overlay manually
- **WHEN** the user presses `Mod+Shift+/`
- **THEN** the keyboard shortcuts help overlay is displayed

#### Scenario: Auto-help on first visit
- **WHEN** the user opens a session page for the first time
- **THEN** the keyboard shortcuts help overlay is displayed automatically

#### Scenario: Auto-help hint on unrecognized shortcut attempt
- **WHEN** the user presses an unrecognized `Mod+Shift+<key>` combination in session context
- **THEN** the UI shows a concise hint pointing to `Mod+Shift+/` help

### Requirement: Browser-safe behavior
The system SHALL preserve native browser/form behavior while handling shortcuts.

#### Scenario: Typing is not interrupted
- **WHEN** focus is inside `input`, `textarea`, `select`, or `[contenteditable]`
- **THEN** session shortcuts are ignored
- **AND** native typing behavior is preserved

#### Scenario: Prevent default only on handled shortcut
- **WHEN** a registered session shortcut is matched
- **THEN** the system calls `preventDefault()` for that event
- **AND** no prevent-default occurs for unrelated keys

#### Scenario: Cross-browser key matching
- **WHEN** browser key event differences occur
- **THEN** shortcut matching uses `event.key` with `event.code` fallback
- **AND** behavior remains consistent across supported browsers
