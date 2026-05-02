## ADDED Requirements

### Requirement: Instructions override hierarchy
The system SHALL resolve instructions using an override hierarchy where ChatThread instructions take precedence over Session instructions, and Session instructions take precedence over Project instructions.

#### Scenario: Thread instructions override all
- **WHEN** a chat thread is created with instructions, and its parent session and project also have instructions
- **THEN** the thread's instructions are used

#### Scenario: Session instructions override project
- **WHEN** a chat thread is created without instructions, but its parent session has instructions
- **THEN** the session's instructions are used

#### Scenario: Project instructions as fallback
- **WHEN** a chat thread is created without instructions, and its parent session has no instructions, but the project has instructions
- **THEN** the project's instructions are used

#### Scenario: No instructions
- **WHEN** a chat thread is created and no instructions exist at any level
- **THEN** no system message is added to chat history

### Requirement: Automatic injection into chat history
The system SHALL automatically save resolved instructions as a `role: "system"` message in the chat thread's JSONL history when the thread is created.

#### Scenario: Thread creation with instructions
- **WHEN** a chat thread is created and resolved instructions exist
- **THEN** a system message with those instructions is saved to the thread's chat history

#### Scenario: System message visibility
- **WHEN** chat history is loaded for a thread
- **THEN** the system message containing instructions is included in the response

### Requirement: Instructions CRUD via REST API
The system SHALL expose `instructions` field through REST APIs for projects, sessions, and chat threads.

#### Scenario: Create project with instructions
- **WHEN** a project is created with an `instructions` field
- **THEN** the project is persisted with those instructions

#### Scenario: Update project instructions
- **WHEN** a project's instructions are updated via PUT
- **THEN** the updated instructions are persisted

#### Scenario: Create session with instructions
- **WHEN** a session is created with an `instructions` field
- **THEN** the session is persisted with those instructions

#### Scenario: Update session instructions
- **WHEN** a session's instructions are updated via PUT
- **THEN** the updated instructions are persisted

#### Scenario: Create thread with instructions
- **WHEN** a chat thread is created with an `instructions` field
- **THEN** the thread is persisted with those instructions

#### Scenario: Update thread instructions
- **WHEN** a chat thread's instructions are updated via PUT/PATCH
- **THEN** the updated instructions are persisted

### Requirement: Instructions visibility in responses
The system SHALL include the `instructions` field in API responses for projects, sessions, and chat threads.

#### Scenario: Get project with instructions
- **WHEN** a project with instructions is retrieved
- **THEN** the response includes the `instructions` field

#### Scenario: Get session with instructions
- **WHEN** a session with instructions is retrieved
- **THEN** the response includes the `instructions` field

#### Scenario: Get thread with instructions
- **WHEN** a chat thread with instructions is retrieved
- **THEN** the response includes the `instructions` field
