## REMOVED Requirements

### Requirement: Pipeline assembles and persists the final message on usage_update
**Reason**: `usage_update` is now a display-only event and shall never trigger persistence or buffer clearing.
**Migration**: Persistence happens exclusively in `prompt_completed` and `prompt_cancelled` handlers.

## MODIFIED Requirements

### Requirement: Pipeline accumulates thought chunks
The `ChatStreamingPipeline` SHALL accumulate `thought_chunk` content into a per-thread buffer keyed by `sessionId:chatThreadId` and broadcast each chunk to session subscribers.

#### Scenario: thought chunks are accumulated
- **WHEN** `handleThoughtChunk` is called three times with different content strings
- **THEN** the internal thought buffer contains the concatenation of all three strings

#### Scenario: thought chunk is broadcast to subscribers
- **WHEN** `handleThoughtChunk` is called with a `content` value
- **THEN** the `broadcast` function is called with a `thought_chunk` message containing that `content`

### Requirement: Pipeline accumulates message chunks
The `ChatStreamingPipeline` SHALL accumulate `message_chunk` content into a per-thread buffer and broadcast each chunk.

#### Scenario: message chunks are accumulated
- **WHEN** `handleMessageChunk` is called multiple times
- **THEN** the internal message buffer contains the concatenation of all content values

#### Scenario: message chunk is broadcast
- **WHEN** `handleMessageChunk` is called
- **THEN** `broadcast` is called with a `message_chunk` message

### Requirement: Pipeline persists the final message on prompt_completed
The `ChatStreamingPipeline` SHALL assemble the full assistant message content from buffered thoughts, tool calls, and message content when `handlePromptCompleted` is called, call `ChatService.saveMessage` with the assembled content, and clear the buffers.

#### Scenario: message assembled with thought and tool data
- **WHEN** `handlePromptCompleted` is called after thought chunks and message chunks have been buffered
- **THEN** `ChatService.saveMessage` is called with content in `<details><summary>Thought Process</summary>...</details>\n\n<message>` format

#### Scenario: message assembled without thoughts
- **WHEN** `handlePromptCompleted` is called with only message chunks buffered (no thought chunks)
- **THEN** `ChatService.saveMessage` is called with only the message content (no `<details>` wrapper)

#### Scenario: buffers cleared after prompt_completed
- **WHEN** `handlePromptCompleted` completes
- **THEN** the thought buffer, message buffer, and tool call buffer for that thread are cleared

### Requirement: Pipeline persists partial content on prompt_cancelled
The `ChatStreamingPipeline` SHALL save any accumulated content as a cancelled message when the turn is cancelled, and clear all buffers.

#### Scenario: cancelled turn saves partial content
- **WHEN** `flushAsCancelled` is called after some thought and message chunks have been buffered
- **THEN** `ChatService.saveMessage` is called with the partial content and `metadata.cancelled: true`

### Requirement: Pipeline handles usage_update as display-only
The `ChatStreamingPipeline` SHALL receive `usage_update` with a `usage` object, broadcast it to UI subscribers, and leave all buffers intact. `usage_update` SHALL NOT invoke `saveMessage` nor clear any buffer.

#### Scenario: usage_update broadcasts usage
- **WHEN** `handleUsageUpdate` is called with a `usage` object
- **THEN** the same `usage` object is propagated to UI subscribers via `broadcast`

#### Scenario: usage_update does not persist or clear
- **WHEN** `handleUsageUpdate` is called after thought and message chunks have been buffered
- **THEN** no `saveMessage` is invoked and all buffers remain intact

### Requirement: Pipeline tracks message duration
The `ChatStreamingPipeline` SHALL record the start time on `handleThoughtStart` (or `handleMessageChunk` as fallback) and compute a human-readable duration string on `handlePromptCompleted`, included in the saved message metadata. The `prompt_completed` broadcast to clients MUST include `duration` and `durationMs` fields.

#### Scenario: duration included in saved message
- **WHEN** `handleThoughtStart` is called, followed by `handlePromptCompleted` some milliseconds later
- **THEN** `ChatService.saveMessage` is called with `metadata.duration` and `metadata.durationMs` set

#### Scenario: duration included in prompt_completed broadcast
- **WHEN** `handlePromptCompleted` is called
- **THEN** the broadcasted `prompt_completed` message includes `duration` and `durationMs` fields

### Requirement: Pipeline provides streaming snapshot for reconnecting clients
The `ChatStreamingPipeline` SHALL expose `getStreamingSnapshot(sessionId, threadId?)` returning the current `thoughtContent` and `messageContent` for a thread, enabling reconnecting or thread-switching clients to receive in-progress output.

#### Scenario: snapshot reflects current buffer state
- **WHEN** thought chunks and message chunks have been accumulated for a thread
- **THEN** `getStreamingSnapshot` returns an object with matching `thoughtContent` and `messageContent`

#### Scenario: snapshot returns empty strings for unknown thread
- **WHEN** `getStreamingSnapshot` is called for a thread with no buffered content
- **THEN** it returns `{ thoughtContent: "", messageContent: "" }`

### Requirement: Pipeline clears buffers on request
The `ChatStreamingPipeline` SHALL expose `clearBuffers(sessionId, threadId?)` that removes all buffered state for a thread (used on cancel).

#### Scenario: clear removes all buffers for thread
- **WHEN** `clearBuffers` is called for a thread that has accumulated thought, message, and tool call data
- **THEN** subsequent `getStreamingSnapshot` returns empty strings for that thread
