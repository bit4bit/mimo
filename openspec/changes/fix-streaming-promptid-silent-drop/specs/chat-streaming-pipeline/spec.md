## MODIFIED Requirements

### Requirement: Pipeline provides streaming snapshot for reconnecting clients

The `ChatStreamingPipeline` SHALL expose `getStreamingSnapshot(sessionId, threadId?)` returning the current `thoughtContent`, `messageContent`, and `promptId` for a thread, enabling reconnecting or thread-switching clients to receive in-progress output and resume accepting streaming chunks.

#### Scenario: snapshot includes current promptId

- **WHEN** thought chunks and message chunks have been accumulated for a thread with a known `promptId` (from `currentPromptByThread`)
- **THEN** `getStreamingSnapshot` returns an object with `thoughtContent`, `messageContent`, and `promptId`

#### Scenario: snapshot with no active prompt

- **WHEN** `getStreamingSnapshot` is called for a thread with no `promptId` in `currentPromptByThread`
- **THEN** it returns `{ thoughtContent: "", messageContent: "", promptId: null }`

#### Scenario: snapshot returns empty strings and null promptId for unknown thread

- **WHEN** `getStreamingSnapshot` is called for a thread with no buffered content
- **THEN** it returns `{ thoughtContent: "", messageContent: "", promptId: null }`