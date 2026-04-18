## ADDED Requirements

### Requirement: Right-frame collapse keyboard action
The session page SHALL provide a keyboard action to toggle right-frame collapse.

#### Scenario: Toggle right frame with default shortcut
- **WHEN** the user presses `Alt+Shift+Control+F` in session context
- **THEN** the right frame collapse state toggles
- **AND** the same behavior occurs as clicking the right-frame collapse/restore control

#### Scenario: Configurable right-frame collapse shortcut
- **WHEN** `sessionKeybindings.toggleRightFrame` is set in config
- **THEN** that configured binding triggers right-frame collapse toggle
- **AND** the default binding is overridden for that session page

#### Scenario: Prevent default only when toggle is handled
- **WHEN** the right-frame toggle shortcut is matched and handled
- **THEN** the system calls `preventDefault()` for that key event
- **AND** unrelated shortcuts keep existing behavior
