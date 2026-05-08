## MODIFIED Requirements

### Requirement: streaming_state message handling

The system SHALL send streaming_state after history when reconnecting during active streaming.

#### Scenario: Reconstruct streaming UI for prompt in flight with no chunks

- **WHEN** client connects or switches to a thread
- **AND** agent is alive and processing a prompt for that thread
- **AND** no content chunks have been received yet
- **THEN** server sends streaming_state with empty messageContent and thoughtContent
- **AND** client inserts streaming message element with "Received, processing..." indicator

#### Scenario: Reconstruct streaming UI after thread switch with accumulated content

- **WHEN** client switches to a thread with active streaming
- **AND** server sends streaming_state after history
- **THEN** client verifies existing streaming element is connected to DOM before reusing it
- **AND** if element is detached or missing, client creates new streaming element
- **AND** client displays accumulated content in proper structure

#### Scenario: Do not send streaming_state when agent is idle

- **WHEN** client requests state for a thread
- **AND** agent is alive but not processing any prompt for that thread
- **AND** no content buffers exist
- **THEN** server does not send streaming_state
- **AND** client shows editable input bubble
