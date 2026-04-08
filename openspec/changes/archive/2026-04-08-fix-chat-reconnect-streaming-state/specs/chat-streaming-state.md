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
  "timestamp": "ISO8601"
}
```

**Behavior:**
- `thoughtContent` may be empty string if no thought chunks received yet
- `messageContent` may be empty string if no message chunks received yet
- Client reconstructs streaming UI from these values

### Requirements

1. Server MUST send `streaming_state` after `history` when reconnecting during active streaming
2. Server MUST include current `thoughtContent` from `thoughtBuffers`
3. Server MUST include current `messageContent` from `streamingBuffers`
4. Client MUST display accumulated content in proper structure (thought section + message)
5. Client MUST NOT show editable bubble until `usage_update` arrives
