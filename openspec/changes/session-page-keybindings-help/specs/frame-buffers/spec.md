## MODIFIED Requirements

### Requirement: Buffer switching
The system SHALL allow frame/buffer activation from both tab clicks and keyboard-triggered actions.

#### Scenario: Notes buffer becomes active from keyboard notes action
- **WHEN** user triggers a notes-focus shortcut from the session key profile
- **THEN** the right frame active buffer is set to `notes`
- **AND** frame state is persisted using the same API path as tab click switching

### Requirement: Notes buffer
The Notes buffer SHALL support keyboard-first focus routing to both note sections.

#### Scenario: Focus Project Notes from keyboard action
- **WHEN** keyboard action targets Project Notes
- **THEN** Notes buffer is visible in the right frame
- **AND** focus moves to `#project-notes-input`

#### Scenario: Focus Session Notes from keyboard action
- **WHEN** keyboard action targets Session Notes
- **THEN** Notes buffer is visible in the right frame
- **AND** focus moves to `#notes-input`
