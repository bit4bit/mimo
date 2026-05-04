## MODIFIED Requirements

### Requirement: Programmatic chat thread creation
The system SHALL provide API endpoints to create and manage chat threads without UI interaction.

#### Scenario: API creates chat thread
- **WHEN** client calls `POST /sessions/:id/chat-threads` with `{name, model, mode}`
- **THEN** system validates the name is unique within the session
- **AND** creates thread metadata
- **AND** initializes ACP runtime for that thread
- **AND** returns created thread including `chatThreadId`, `model`, and `mode`

#### Scenario: API rejects duplicate thread name
- **WHEN** client calls `POST /sessions/:id/chat-threads` with a name already used by another thread in the same session
- **THEN** system responds with HTTP 400 and error message indicating the name is already in use

## ADDED Requirements

### Requirement: Chat thread names are unique per session
The system SHALL enforce that no two chat threads within the same session share the same name.

#### Scenario: Create thread with unique name
- **WHEN** user creates chat thread "Reviewer" in a session that has no thread named "Reviewer"
- **THEN** system creates the thread successfully

#### Scenario: Reject duplicate name on creation
- **WHEN** user creates chat thread "Reviewer" in a session that already has a thread named "Reviewer"
- **THEN** system rejects the request with error "A thread with name 'Reviewer' already exists in this session"

#### Scenario: Reject duplicate name on rename
- **WHEN** user renames thread "Main" to "Reviewer" in a session that already has a thread named "Reviewer"
- **THEN** system rejects the request with error "A thread with name 'Reviewer' already exists in this session"

#### Scenario: Allow renaming to current name
- **WHEN** user renames thread "Reviewer" to "Reviewer" (same name)
- **THEN** system allows the operation (no-op)

#### Scenario: Case-sensitive uniqueness
- **WHEN** user creates thread "Foo" in a session that already has a thread named "foo"
- **THEN** system creates the thread successfully (names are distinct)
