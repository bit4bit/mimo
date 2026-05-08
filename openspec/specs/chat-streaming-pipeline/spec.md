# chat-streaming-pipeline Specification

## Purpose

TBD - created by archiving change extract-chat-streaming-pipeline. Update Purpose after archive.

## Requirements

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

### Requirement: Pipeline assembles and persists the final message on usage_update

The `ChatStreamingPipeline` SHALL assemble the full assistant message content from buffered thoughts, tool calls, and message content on `handleUsageUpdate`, call `ChatService.saveMessage` with the assembled content, and clear the buffers.

#### Scenario: message assembled with thought and tool data

- **WHEN** `handleUsageUpdate` is called after thought chunks and message chunks have been buffered
- **THEN** `ChatService.saveMessage` is called with content in `<details><summary>Thought Process</summary>...</details>\n\n<message>` format

#### Scenario: message assembled without thoughts

- **WHEN** `handleUsageUpdate` is called with only message chunks buffered (no thought chunks)
- **THEN** `ChatService.saveMessage` is called with only the message content (no `<details>` wrapper)

#### Scenario: buffers cleared after usage_update

- **WHEN** `handleUsageUpdate` completes
- **THEN** the thought buffer, message buffer, and tool call buffer for that thread are cleared

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

### Requirement: Pipeline tracks message duration

The `ChatStreamingPipeline` SHALL record the start time on `handleThoughtStart` (or `handleMessageChunk` as fallback) and compute a human-readable duration string on `handleUsageUpdate`, included in the saved message metadata.

#### Scenario: duration included in saved message

- **WHEN** `handleThoughtStart` is called, followed by `handleUsageUpdate` some milliseconds later
- **THEN** `ChatService.saveMessage` is called with `metadata.duration` and `metadata.durationMs` set
