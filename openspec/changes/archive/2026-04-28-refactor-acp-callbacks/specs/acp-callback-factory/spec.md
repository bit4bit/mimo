## ADDED Requirements

### Requirement: Callback factory produces correct WS messages

The `buildAcpCallbacks` factory SHALL return an `AcpClientCallbacks` object whose handlers emit correctly typed WebSocket messages (`thought_start`, `thought_chunk`, `thought_end`, `message_chunk`, `tool_call`, `tool_call_update`, `usage_update`, `acp_response`, `permission_request`) with the correct `sessionId` and `chatThreadId` fields.

#### Scenario: thought_start emitted with correct fields

- **WHEN** `onThoughtStart(sessionId, chatThreadId)` callback is invoked
- **THEN** a `thought_start` message with matching `sessionId` and `chatThreadId` is sent over the WebSocket

#### Scenario: message_chunk emitted with content

- **WHEN** `onMessageChunk(sessionId, content)` callback is invoked
- **THEN** a `message_chunk` message with matching `sessionId`, `chatThreadId`, and `content` is sent over the WebSocket

#### Scenario: tool_call emitted with truncated input

- **WHEN** `onToolCall(sessionId, tool)` is invoked with `rawInput` exceeding 200 characters
- **THEN** a `tool_call` message is sent with `toolInput` truncated to 200 characters plus `"..."`

### Requirement: Callback factory records activity on all spawn paths

The `buildAcpCallbacks` factory SHALL call `lifecycleManager.recordActivity(sessionId, chatThreadId)` inside `onThoughtStart`, `onThoughtChunk`, `onMessageChunk`, `onToolCall`, and `onToolCallUpdate` — in BOTH `spawnAcpProcess` and `respawnAcpProcess` call paths.

#### Scenario: recordActivity called during initial spawn thought events

- **WHEN** ACP is started via `spawnAcpProcess` and the provider emits a `thought_chunk`
- **THEN** `lifecycleManager.recordActivity` is called with the correct `sessionId` and `chatThreadId`

#### Scenario: recordActivity called during respawn message events

- **WHEN** ACP is respawned via `respawnAcpProcess` and the provider emits a `message_chunk`
- **THEN** `lifecycleManager.recordActivity` is called with the correct `sessionId` and `chatThreadId`

#### Scenario: recordActivity called on tool_call in initial spawn

- **WHEN** ACP is started via `spawnAcpProcess` and the provider emits a tool call
- **THEN** `lifecycleManager.recordActivity` is called with the correct `sessionId` and `chatThreadId`
