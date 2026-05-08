## MODIFIED Requirements

### Requirement: Pipeline assembles and persists the final message on usage_update

The `ChatStreamingPipeline` SHALL assemble the full assistant message content from buffered thoughts, tool calls, and message content on `handlePromptCompleted`, call `ChatService.saveMessage` with the assembled content, and clear the buffers.

#### Scenario: message assembled with thought and tool data

- **WHEN** `handlePromptCompleted` is called after thought chunks and message chunks have been buffered
- **THEN** `ChatService.saveMessage` is called with content in `<details><summary>Thought Process</summary>...</details>\n\n<message>` format

#### Scenario: message assembled without thoughts

- **WHEN** `handlePromptCompleted` is called with only message chunks buffered (no thought chunks)
- **THEN** `ChatService.saveMessage` is called with only the message content (no `<details>` wrapper)

#### Scenario: buffers cleared after prompt_completed

- **WHEN** `handlePromptCompleted` completes
- **THEN** the thought buffer, message buffer, and tool call buffer for that thread are cleared

#### Scenario: usage_update does not finalize message

- **WHEN** `handleUsageUpdate` is called
- **THEN** `ChatService.saveMessage` is NOT called
- **AND** the internal buffers remain intact

### Requirement: Pipeline tracks message duration

The `ChatStreamingPipeline` SHALL record the start time on `handleThoughtStart` (or `handleMessageChunk` as fallback) and compute a human-readable duration string on `handlePromptCompleted`, included in the saved message metadata.

#### Scenario: duration included in saved message

- **WHEN** `handleThoughtStart` is called, followed by `handlePromptCompleted` some milliseconds later
- **THEN** `ChatService.saveMessage` is called with `metadata.duration` and `metadata.durationMs` set

## ADDED Requirements

### Requirement: Pipeline handles prompt_completed event

The `ChatStreamingPipeline` SHALL expose `handlePromptCompleted(sessionId, threadId, session)` that builds the final message, saves it via `ChatService.saveMessage`, broadcasts a `prompt_completed` event to subscribers, and clears all buffers for the thread.

#### Scenario: prompt_completed after multi-phase response

- **WHEN** the agent emits `prompt_completed` after sending `usage_update`, `message_chunk`, and another `usage_update`
- **THEN** the message is saved only once, containing all accumulated content
- **AND** only one agent message box appears in the UI

#### Scenario: prompt_completed with no buffered content

- **WHEN** `handlePromptCompleted` is called with empty buffers
- **THEN** no message is saved
- **AND** buffers remain empty (no-op)

### Requirement: usage_update broadcasts metadata without finalizing

The `ChatStreamingPipeline` SHALL broadcast `usage_update` to subscribers with usage metadata (cost, tokens, duration) but SHALL NOT save the message or clear buffers.

#### Scenario: usage_update mid-stream

- **WHEN** `handleUsageUpdate` is called while streaming is still in progress
- **THEN** subscribers receive the usage metadata
- **AND** streaming continues for subsequent message chunks
- **AND** buffers are not cleared
