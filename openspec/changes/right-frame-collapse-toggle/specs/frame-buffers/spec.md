## MODIFIED Requirements

### Requirement: Frame layout
The session page SHALL support collapsing and restoring the right frame while preserving the two-frame model.

#### Scenario: Collapse right frame from UI control
- **WHEN** the user activates the right-frame collapse button
- **THEN** the right frame is collapsed from the visible layout
- **AND** the left frame expands to use available width

#### Scenario: Restore right frame from UI control
- **WHEN** the user activates the right-frame restore control while right frame is collapsed
- **THEN** the right frame is shown again
- **AND** the layout returns to the standard split view

### Requirement: Frame state persistence
Frame state SHALL persist right-frame collapse state per session.

#### Scenario: Collapse state survives page reload
- **WHEN** a user collapses the right frame and frame state is persisted
- **THEN** subsequent session page loads render with right frame collapsed

#### Scenario: Backward-compatible frame state normalization
- **WHEN** persisted frame state does not include collapse metadata
- **THEN** the system treats right frame collapse state as `false`

### Requirement: Buffer preservation across collapse
Collapsing the right frame SHALL NOT reset right-frame active buffer selection.

#### Scenario: Right-frame active buffer is preserved
- **GIVEN** the right frame active buffer is `notes`
- **WHEN** the user collapses and later restores the right frame
- **THEN** the right frame active buffer remains `notes`

### Requirement: Frame-state update API
The frame-state update API SHALL support right-frame collapse updates.

#### Scenario: Persist right-frame collapse via frame-state endpoint
- **WHEN** the client sends a frame-state update for the right frame with collapse value
- **THEN** the server persists the collapse value
- **AND** returns normalized frame state including collapse value
