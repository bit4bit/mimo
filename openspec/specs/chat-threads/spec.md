## ADDED Requirements

### Requirement: Session supports multiple chat threads
The system SHALL allow multiple chat threads within a single session.

#### Scenario: Create a second chat thread
- **WHEN** user creates chat thread "Reviewer"
- **THEN** system stores a new thread with unique `chatThreadId`
- **AND** thread is associated with the same session
- **AND** session still uses the same `upstream`, checkout, and `repo.fossil`

### Requirement: Each chat thread has isolated ACP context
The system SHALL run a dedicated ACP runtime for each chat thread.

#### Scenario: Thread runtimes are independent
- **WHEN** session has threads "Main" and "Reviewer"
- **THEN** system spawns two ACP runtimes
- **AND** both runtimes use the same checkout path
- **AND** each runtime keeps independent conversation context

### Requirement: Each chat thread stores model and mode
The system SHALL persist model and mode at chat-thread level.

#### Scenario: Different model and mode per thread
- **WHEN** user configures `Main` with model "gpt-5" and mode "code"
- **AND** configures `Reviewer` with model "claude-4" and mode "review"
- **THEN** system stores both configurations independently
- **AND** updating one thread SHALL NOT mutate the other thread

### Requirement: Programmatic chat thread creation
The system SHALL provide API endpoints to create and manage chat threads without UI interaction.

#### Scenario: API creates chat thread
- **WHEN** client calls `POST /sessions/:id/chat-threads` with `{name, model, mode}`
- **THEN** system creates thread metadata
- **AND** initializes ACP runtime for that thread
- **AND** returns created thread including `chatThreadId`, `model`, and `mode`

### Requirement: Active chat thread is persisted
The system SHALL persist which chat thread is currently active for the session UI.

#### Scenario: Activate chat thread
- **WHEN** user activates thread "Reviewer"
- **THEN** system stores `activeChatThreadId` as "Reviewer" thread ID
- **AND** next page load opens that thread as active
