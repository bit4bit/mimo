## ADDED Requirements

### Requirement: Chat thread names are editable from the UI

The system SHALL allow users to rename any chat thread by double-clicking the thread's tab in the chat thread tab strip. The tab name SHALL become an inline editable input pre-filled with the current name.

#### Scenario: Double-click enters inline edit mode

- **WHEN** user double-clicks a chat thread tab
- **THEN** the tab name is replaced by a text input pre-filled with the current thread name
- **AND** the input text is selected for quick replacement

#### Scenario: Enter or blur commits the new name

- **WHEN** user presses Enter or the input loses focus while the name has changed
- **THEN** the system sends a rename request with the new name
- **AND** on success the tab displays the updated name

#### Scenario: Escape cancels the edit

- **WHEN** user presses Escape while editing
- **THEN** the input is removed and the original tab name is restored without sending a request

#### Scenario: Single-click still switches threads

- **WHEN** user single-clicks a thread tab
- **THEN** the system switches to that thread as before
- **AND** double-click on an already-active tab enters edit mode without switching

### Requirement: Inline rename validates name input

The system SHALL validate the new thread name before submitting and on server error.

#### Scenario: Empty name is rejected

- **WHEN** user clears the input and attempts to commit
- **THEN** the system does not send a rename request
- **AND** the edit is cancelled and the original name is restored

#### Scenario: Unchanged name is a no-op

- **WHEN** user commits a name identical to the current name
- **THEN** no rename request is sent
- **AND** the input is removed and the original tab is restored

#### Scenario: Duplicate name shows inline error

- **WHEN** user commits a name that already exists on another thread in the same session
- **THEN** the system rejects the rename with a visible error indication on the input
- **AND** the input remains in edit mode so the user can correct the name

#### Scenario: Server-side duplicate rejection is surfaced

- **WHEN** the server returns an error indicating the name already exists
- **THEN** the system shows a visible error indication on the input
- **AND** the input remains in edit mode so the user can try again

### Requirement: Thread rename syncs across open clients

The system SHALL broadcast thread rename events to all WebSocket-connected clients for the session so multiple open browser tabs see the new name without a page reload.

#### Scenario: Rename in one tab updates others

- **WHEN** a thread is renamed in one browser tab
- **THEN** all other open tabs for the same session receive a `chat_thread_renamed` WebSocket message
- **AND** each tab updates the thread name in its tab strip and context bar

#### Scenario: Active thread context bar updates on remote rename

- **WHEN** a `chat_thread_renamed` message arrives for the currently active thread
- **THEN** the thread context bar name display is updated to the new name

### Requirement: Thread name length is bounded

The system SHALL enforce a maximum length on thread names in both the create dialog and the inline rename input to prevent layout-breaking long names.

#### Scenario: Inline rename input has maxlength

- **WHEN** user types in the inline rename input
- **THEN** input is capped at 60 characters

#### Scenario: Create dialog name input has maxlength

- **WHEN** user types in the create thread dialog name field
- **THEN** input is capped at 60 characters

### Requirement: Summary buffer selects refresh on rename

The system SHALL refresh summary-buffer thread select dropdowns after a thread rename so displayed names stay current.

#### Scenario: Summary selects update after rename

- **WHEN** a thread is successfully renamed
- **THEN** the summary-buffer analyze and summarize thread select dropdowns are rebuilt with the updated name