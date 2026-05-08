## MODIFIED Requirements

### Requirement: streaming_state message handling

The system SHALL send streaming_state after history when reconnecting during active streaming.

#### Scenario: Reconstruct streaming UI after thread switch

- **WHEN** client switches to a thread with active streaming
- **AND** server sends `streaming_state` after `history`
- **THEN** client verifies existing streaming element is connected to DOM before reusing it
- **AND** if element is detached or missing, client creates new streaming element
- **AND** client displays accumulated content in proper structure

#### Scenario: Handle streaming state with empty content

- **WHEN** server sends `streaming_state` with empty `messageContent` and `thoughtContent`
- **AND** streaming was cancelled before any chunks arrived
- **THEN** client creates streaming element with empty content
- **AND** client displays cancelled indicator
