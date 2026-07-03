## MODIFIED Requirements

### Requirement: Streaming event rejection recovery

The system SHALL recover from rejected streaming events by requesting a replay whenever an event is rejected unrecoverably, regardless of whether a streaming element is currently present. Recovery SHALL NOT depend on the presence of `ChatState.streaming.messageElement`.

#### Scenario: Current promptId is null and streaming element exists

- **WHEN** a streaming event arrives and `ChatState.currentPromptId` is null
- **AND** `ChatState.streaming.messageElement` exists (streaming UI is visible)
- **THEN** client SHALL send `request_replay` via WebSocket
- **AND** client SHALL set a `replayRequested` flag to prevent duplicate requests
- **AND** `loadChatHistory` SHALL clear the `replayRequested` flag after replay completes

#### Scenario: Current promptId is null and no streaming element exists

- **WHEN** a streaming event arrives and `ChatState.currentPromptId` is null
- **AND** `ChatState.streaming.messageElement` does not exist
- **AND** `ChatState.replayRequested` is not already set
- **THEN** client SHALL send `request_replay` via WebSocket
- **AND** client SHALL set the `replayRequested` flag to prevent duplicate requests
- **AND** the streaming event SHALL NOT be silently dropped without a recovery attempt

#### Scenario: PromptId mismatch with no usable event promptId

- **WHEN** a streaming event arrives whose `promptId` does not match `ChatState.currentPromptId`
- **AND** the event carries no valid `promptId` to adopt
- **AND** `ChatState.replayRequested` is not already set
- **THEN** client SHALL send `request_replay` via WebSocket
- **AND** client SHALL set the `replayRequested` flag to prevent duplicate requests

#### Scenario: PromptId mismatch with active streaming

- **WHEN** a streaming event arrives with a `promptId` that does not match `ChatState.currentPromptId`
- **AND** the event's `promptId` is a valid string
- **THEN** client SHALL log a warning with event type, expected promptId, and received promptId
- **AND** client SHALL update `ChatState.currentPromptId` to the received `promptId`
- **AND** client SHALL accept the event for rendering

#### Scenario: Rejected streaming events are logged

- **WHEN** `shouldAcceptStreamingEvent` returns false for any event
- **THEN** client SHALL emit `console.warn` with event type, `currentPromptId` value, and event `promptId` value
