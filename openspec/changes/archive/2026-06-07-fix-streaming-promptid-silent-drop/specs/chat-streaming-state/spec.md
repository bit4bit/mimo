## MODIFIED Requirements

### Requirement: streaming_state message handling

The system SHALL send streaming_state after history when reconnecting during active streaming.

#### Scenario: Reconstruct streaming UI after reconnection with promptId

- **WHEN** client reconnects during active streaming
- **AND** server sends `streaming_state` after `history`
- **THEN** `streaming_state` payload includes `promptId` field
- **AND** client sets `ChatState.currentPromptId` to the received `promptId`
- **AND** client verifies existing streaming element is connected to DOM before reusing it
- **AND** if element is detached or missing, client creates new streaming element
- **AND** subsequent `message_chunk` and `thought_chunk` events pass the `shouldAcceptStreamingEvent` gate and are rendered

#### Scenario: Handle streaming state without promptId

- **WHEN** server sends `streaming_state` without a `promptId` field
- **THEN** client reconstructs streaming UI from content as before
- **AND** client does not set `ChatState.currentPromptId`
- **AND** subsequent streaming events are subject to existing gate behavior