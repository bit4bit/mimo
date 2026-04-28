## MODIFIED Requirements

### Requirement: Reconnect sends thread-specific streaming state
The system SHALL send streaming state for the active chat thread when reconnecting during active streaming.

#### Scenario: Reconnect to active thread
- **WHEN** client reconnects during active streaming for `chatThreadId=t1`
- **THEN** server sends `history` for `t1`
- **AND** server sends `streaming_state` for `t1`
- **AND** payload includes `chatThreadId=t1`

### Requirement: Stream events are routed by chat thread
The system SHALL include `chatThreadId` in streaming events and route them only to the matching thread UI.

#### Scenario: Concurrent streams in two threads
- **WHEN** thread `t1` and `t2` both stream content
- **THEN** each chunk/event includes its `chatThreadId`
- **AND** UI updates only the matching thread transcript
- **AND** content from `t1` SHALL NOT appear in `t2`
