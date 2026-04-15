## ADDED Requirements

### Requirement: Platform tracks agent response start time
When the platform receives the first signal of an agent response for a session, it SHALL record the current time as the start of that response.

#### Scenario: thought_start received
- **WHEN** the platform receives a `thought_start` message from the agent for a session
- **THEN** the platform records `Date.now()` as the message start time for that session (overwriting any prior value)

#### Scenario: message_chunk received with no prior start time
- **WHEN** the platform receives a `message_chunk` for a session that has no recorded start time
- **THEN** the platform records `Date.now()` as the message start time for that session

#### Scenario: subsequent message_chunk arrives
- **WHEN** the platform receives a `message_chunk` for a session that already has a recorded start time
- **THEN** the platform does NOT update the start time

---

### Requirement: Platform computes and persists duration on usage_update
When the platform receives `usage_update` and saves the assistant `ChatMessage`, it SHALL include the elapsed duration in the message metadata.

#### Scenario: Start time was recorded
- **WHEN** `usage_update` is received for a session with a recorded start time, AND there is buffered assistant content to save
- **THEN** the platform computes `durationMs = Date.now() - startTime`
- **AND** formats `duration` as `${Math.floor(durationMs/60000)}m${Math.floor((durationMs%60000)/1000)}s`
- **AND** saves the `ChatMessage` with `metadata: { duration, durationMs }`
- **AND** deletes the start time entry for that session

#### Scenario: No start time was recorded
- **WHEN** `usage_update` is received for a session with no recorded start time
- **THEN** the `ChatMessage` is saved without `metadata.duration`

---

### Requirement: Platform broadcasts duration in usage_update event
When the platform broadcasts `usage_update` to chat clients, it SHALL include the computed duration.

#### Scenario: Duration was computed
- **WHEN** `usage_update` is broadcast and a duration was computed
- **THEN** the broadcast payload includes `duration: "<Nm>Ns"` (e.g. `"1m23s"`) and `durationMs: <number>` (e.g. `83000`)

#### Scenario: Duration was not computed
- **WHEN** `usage_update` is broadcast and no duration was computed
- **THEN** the broadcast payload omits both the `duration` and `durationMs` fields

---

### Requirement: Chat UI shows duration in Agent message header (live)
When the browser receives `usage_update` after a streamed response, the finalized Agent message header SHALL display the duration and datetime.

#### Scenario: usage_update received with duration
- **WHEN** the browser receives `usage_update` with a `duration` field
- **THEN** the Agent message header displays `<duration> · <datetime>` next to the "Agent" label
- **AND** the datetime is formatted using `toLocaleString()` of the current time

#### Scenario: usage_update received without duration
- **WHEN** the browser receives `usage_update` with no `duration` field
- **THEN** the Agent message header shows only the "Agent" label (no meta span added)

---

### Requirement: Footer status bar shows cumulative total duration to the left of Cost
The `#chat-usage` footer SHALL display `Duration: <total>` as the leftmost field whenever `ChatState.totalDurationMs > 0`. The total accumulates across all agent responses in the session.

#### Scenario: First usage_update received with duration
- **WHEN** the browser receives the first `usage_update` with `durationMs` for a session
- **THEN** `ChatState.totalDurationMs` is set to that `durationMs`
- **AND** the `#chat-usage` footer displays `Duration: <total> | Cost: $X.XXXX | ...`

#### Scenario: Subsequent usage_update received with duration
- **WHEN** the browser receives a subsequent `usage_update` with `durationMs`
- **THEN** `ChatState.totalDurationMs` is incremented by that `durationMs`
- **AND** the footer shows the updated cumulative total

#### Scenario: usage_update received without durationMs
- **WHEN** the browser receives `usage_update` with no `durationMs` field
- **THEN** `ChatState.totalDurationMs` is not changed
- **AND** the footer shows the existing total (or omits `Duration:` if total is still 0)

#### Scenario: Footer seeded from history on page load
- **WHEN** `loadChatHistory` processes a history list containing assistant messages with `metadata.durationMs`
- **THEN** `ChatState.totalDurationMs` is initialized to the sum of all `metadata.durationMs` values
- **AND** `updateUsageDisplay` is called once after history finishes loading so the footer reflects the total

#### Scenario: History has no messages with durationMs
- **WHEN** `loadChatHistory` processes history with no `metadata.durationMs` on any message
- **THEN** `ChatState.totalDurationMs` remains 0
- **AND** the footer omits the `Duration:` field

#### Scenario: History has duration but no usage cost record
- **WHEN** `loadChatHistory` seeds `ChatState.totalDurationMs > 0` but `lastUsageCost` is null (no usage records in history)
- **THEN** the `#chat-usage` footer is shown and displays `Duration: <total>` with no `Cost:` / `Tokens:` / `Context:` fields

---

### Requirement: Chat UI shows duration in Agent message header (history)
When the browser loads chat history and renders an assistant message that has `metadata.duration`, the message header SHALL display the duration and timestamp.

#### Scenario: History message has metadata.duration
- **WHEN** `loadChatHistory` renders an assistant message with `metadata.duration` set
- **THEN** `renderMessage` adds a meta span showing `<duration> · <datetime>` in the header

#### Scenario: History message has no metadata.duration
- **WHEN** `loadChatHistory` renders an assistant message without `metadata.duration`
- **THEN** no meta span is added; the header shows only "Agent"

---

### Requirement: Duration visible in chat.jsonl historic file
The `chat.jsonl` file for a session SHALL contain `metadata.duration` and `metadata.durationMs` on assistant messages where duration was tracked.

#### Scenario: Inspecting historic file
- **WHEN** a user reads the `chat.jsonl` for a session
- **THEN** each assistant message resulting from a tracked response contains a `metadata` object with `duration` (string, e.g. `"2m5s"`) and `durationMs` (number, e.g. `125000`)
