## ADDED Requirements

### Requirement: Client buffers streaming_state until history has loaded

The client SHALL buffer a `streaming_state` message that arrives before `loadChatHistory` has completed for the current thread switch, and apply it once history finishes rendering. This guarantees the in-progress partial response is visible regardless of whether `streaming_state` or `history` arrives first.

#### Scenario: streaming_state arrives before history

- **WHEN** the client switches to a thread with an active stream
- **AND** `streaming_state` arrives before the `history` message
- **AND** `historyLoaded` for the current switch is `false`
- **THEN** client SHALL store the `streaming_state` payload into `pendingStreamingSnapshot`
- **AND** client SHALL NOT build the streaming bubble yet
- **AND** client SHALL NOT wipe it via `loadChatHistory`

#### Scenario: history arrives after a buffered streaming_state

- **WHEN** `loadChatHistory` finishes rendering finalized messages
- **AND** `pendingStreamingSnapshot` is non-null
- **THEN** client SHALL apply the buffered snapshot (build streaming bubble, render partial content)
- **AND** client SHALL clear `pendingStreamingSnapshot`
- **AND** client SHALL set `historyLoaded` to `true`

#### Scenario: streaming_state arrives after history

- **WHEN** the client switches to a thread with an active stream
- **AND** `history` arrives and `loadChatHistory` completes first
- **THEN** client SHALL set `historyLoaded` to `true`
- **AND** when `streaming_state` arrives client SHALL apply it immediately (build bubble, render partial)

#### Scenario: plan and commands remain immediate

- **WHEN** `request_state` reply contains `plan` and `available_commands_update` alongside `streaming_state`
- **AND** `streaming_state` is buffered because history hasn't loaded
- **THEN** client SHALL still apply `plan` and `available_commands_update` immediately on arrival
- **AND** only the `streaming_state` application is gated

### Requirement: Per-switch scoping of streaming reconstruction state

The client SHALL reset the `historyLoaded` flag and `pendingStreamingSnapshot` buffer at the start of each thread switch so a delayed reply from a prior switch cannot bleed into a new thread.

#### Scenario: prepareThreadSwitch resets reconstruction state

- **WHEN** `prepareThreadSwitch` runs at the start of a thread switch
- **THEN** client SHALL set `historyLoaded` to `false`
- **AND** client SHALL set `pendingStreamingSnapshot` to `null`

#### Scenario: streaming_state from a non-active thread is dropped

- **WHEN** a `streaming_state` message arrives with a `chatThreadId` that does not match `activeThreadId`
- **THEN** client SHALL drop the message without buffering or applying it

### Requirement: Safety timeout applies a buffered snapshot without history

The client SHALL apply a buffered `streaming_state` snapshot after a safety interval elapses if `loadChatHistory` has not run for the current switch, so the user is not left waiting indefinitely.

#### Scenario: history never arrives after streaming_state was buffered

- **WHEN** `pendingStreamingSnapshot` is set (streaming_state buffered)
- **AND** approximately 2 seconds elapse without `loadChatHistory` completing
- **THEN** client SHALL apply the buffered snapshot (build bubble, render partial)
- **AND** client SHALL clear `pendingStreamingSnapshot`