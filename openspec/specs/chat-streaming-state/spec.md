## chat-streaming-state

### Overview

When a chat client reconnects during an active streaming session, the server sends the current accumulated streaming state so the client can reconstruct the UI.

### WebSocket Messages

#### Server → Client

##### streaming_state

Sent immediately after `history` when reconnecting during active streaming.

```json
{
  "type": "streaming_state",
  "thoughtContent": "string (accumulated thought chunks)",
  "messageContent": "string (accumulated message chunks)",
  "promptId": "string | null (current prompt in flight)",
  "timestamp": "ISO8601"
}
```

**Behavior:**

- `thoughtContent` may be empty string if no thought chunks received yet
- `messageContent` may be empty string if no message chunks received yet
- `promptId` may be null if no prompt is currently in flight
- Client reconstructs streaming UI from these values
- Client SHALL set `currentPromptId` from `promptId` when present to resume accepting streaming chunks

### Requirements

1. Server MUST send `streaming_state` after `history` when reconnecting during active streaming
2. Server MUST include current `thoughtContent` from `thoughtBuffers`
3. Server MUST include current `messageContent` from `streamingBuffers`
4. Server MUST include current `promptId` from `currentPromptByThread` (null if absent)
5. Client MUST display accumulated content in proper structure (thought section + message)
6. Client MUST set `currentPromptId` from `promptId` field when present
7. Client MUST NOT show editable bubble until `usage_update` arrives
