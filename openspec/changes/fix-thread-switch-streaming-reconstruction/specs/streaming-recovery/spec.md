## MODIFIED Requirements

### Requirement: Streaming event rejection recovery

The system SHALL recover from rejected streaming events by requesting the current streaming state (in-memory snapshot) rather than finalized history, so the in-progress partial response can be reconstructed rather than silently dropped.

#### Scenario: Current promptId is null but streaming is active

- **WHEN** a streaming event arrives and `ChatState.currentPromptId` is null
- **AND** `ChatState.streaming.messageElement` exists (streaming UI is visible)
- **THEN** client SHALL send `request_state` via WebSocket (NOT `request_replay`)
- **AND** client SHALL set a `stateRequested` flag to prevent duplicate requests
- **AND** applying the resulting `streaming_state` SHALL clear the `stateRequested` flag

#### Scenario: PromptId mismatch with active streaming

- **WHEN** a streaming event arrives with a `promptId` that does not match `ChatState.currentPromptId`
- **AND** the event's `promptId` is a valid string
- **THEN** client SHALL log a warning with event type, expected promptId, and received promptId
- **AND** client SHALL update `ChatState.currentPromptId` to the received `promptId`
- **AND** client SHALL accept the event for rendering

#### Scenario: Rejected streaming events are logged

- **WHEN** `shouldAcceptStreamingEvent` returns false for any event
- **THEN** client SHALL emit `console.warn` with event type, `currentPromptId` value, and event `promptId` value

### Requirement: Recovery restores the in-memory partial, not finalized history

The recovery request SHALL target `request_state` because only `request_state` returns `streaming_state` containing the in-memory accumulated partial response. `request_replay` returns only finalized JSONL history and cannot recover an in-progress turn.

#### Scenario: Recovery fetches the partial response snapshot

- **WHEN** the client detects dropped chunks and sends `request_state`
- **AND** the server has a non-empty `streamingBuffers`/`thoughtBuffers` or `promptInFlight` for the thread
- **THEN** server SHALL reply with `streaming_state` containing `thoughtContent`, `messageContent`, and `promptId`
- **AND** client SHALL apply the snapshot to reconstruct the streaming bubble and render the partial

#### Scenario: Recovery on a non-streaming thread returns no snapshot

- **WHEN** the client sends `request_state` for a thread that is not actively streaming
- **AND** the server has no in-memory buffers and no `promptInFlight`
- **THEN** server SHALL NOT send `streaming_state`
- **AND** client SHALL leave the existing finalized messages visible without clobbering the DOM