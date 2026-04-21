## ADDED Requirements

### Requirement: Context-aware shortcut dispatch
The system SHALL dispatch each session keyboard shortcut only when the user's active left-frame buffer matches the shortcut's declared context. Shortcuts declared as global SHALL dispatch regardless of active buffer.

Context is derived from `document.querySelector('.frame-tab[data-frame-id="left"].active').getAttribute("data-buffer-id")`.

#### Scenario: Chat-scoped shortcut ignored outside chat buffer
- **GIVEN** the left-frame active buffer is `edit`
- **WHEN** the user presses `Mod+Shift+ArrowRight`
- **THEN** the active chat thread does NOT change
- **AND** the event's default browser behavior is NOT prevented

#### Scenario: Chat-scoped shortcut fires inside chat buffer
- **GIVEN** the left-frame active buffer is `chat`
- **WHEN** the user presses `Mod+Shift+ArrowRight`
- **THEN** the next available chat thread becomes active

#### Scenario: Edit-scoped shortcut ignored outside edit buffer
- **GIVEN** the left-frame active buffer is `chat`
- **WHEN** the user presses `Mod+Shift+F`
- **THEN** the file finder does NOT open
- **AND** the event's default browser behavior is NOT prevented

#### Scenario: Edit-scoped shortcut fires inside edit buffer
- **GIVEN** the left-frame active buffer is `edit`
- **WHEN** the user presses `Mod+Shift+F`
- **THEN** the file finder opens

#### Scenario: Expert-mode shortcut ignored outside edit buffer
- **GIVEN** expert mode is enabled (persisted flag is true)
- **AND** the left-frame active buffer is `chat`
- **WHEN** the user presses `Alt+Shift+ArrowRight`
- **THEN** the expert-mode focus guide size does NOT change
- **AND** the event's default browser behavior is NOT prevented
- **AND** on macOS the native word-selection gesture proceeds unaffected

#### Scenario: Expert-mode shortcut fires when edit buffer active and expert mode on
- **GIVEN** the left-frame active buffer is `edit`
- **AND** expert mode is enabled and not processing
- **WHEN** the user presses `Alt+Shift+ArrowRight`
- **THEN** the expert-mode focus guide size increases by one line

#### Scenario: Patch-scoped shortcut ignored outside patches buffer
- **GIVEN** the left-frame active buffer is `edit`
- **WHEN** the user presses `Ctrl+Enter`
- **THEN** no pending patch is approved

#### Scenario: Global shortcut fires from any active buffer
- **GIVEN** the left-frame active buffer is any of `chat`, `edit`, or `patches`
- **WHEN** the user presses `Mod+Shift+M`
- **THEN** the commit dialog opens

## MODIFIED Requirements

### Requirement: Thread keyboard actions
The system SHALL allow thread management by keyboard, dispatched only while the left-frame active buffer is `chat`.

#### Scenario: Create thread from keyboard
- **GIVEN** the left-frame active buffer is `chat`
- **WHEN** the user presses `Mod+Shift+N`
- **THEN** the create-thread dialog opens as if `+ New Thread` was clicked

#### Scenario: Move between threads
- **GIVEN** the left-frame active buffer is `chat`
- **WHEN** the user presses `Mod+Shift+ArrowRight`
- **THEN** the next available thread becomes active
- **AND** chat history switches to the selected thread

#### Scenario: Move to previous thread
- **GIVEN** the left-frame active buffer is `chat`
- **WHEN** the user presses `Mod+Shift+ArrowLeft`
- **THEN** the previous available thread becomes active
- **AND** chat history switches to the selected thread

#### Scenario: Thread keyboard actions ignored in non-chat buffer
- **GIVEN** the left-frame active buffer is `edit` or `patches`
- **WHEN** the user presses `Mod+Shift+N`, `Mod+Shift+ArrowRight`, or `Mod+Shift+ArrowLeft`
- **THEN** no thread action is taken
- **AND** the event's default browser behavior is NOT prevented
