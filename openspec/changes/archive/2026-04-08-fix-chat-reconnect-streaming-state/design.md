## Context

The chat system uses WebSocket for real-time streaming of agent responses. When an agent is actively responding:

1. `thought_start` → `thought_chunk` × N → `thought_end`
2. `message_chunk` × N
3. `usage_update` (final)

The server accumulates chunks in `thoughtBuffers` and `streamingBuffers` Maps (per session). Assistant messages are only persisted to `chat.jsonl` when `usage_update` arrives.

**Current reconnect behavior** (index.tsx lines 195-214):
- Load history from `chat.jsonl` → sends incomplete history (missing assistant response)
- Client sees `lastRole = 'user'` → no input box shown
- User cannot type until streaming completes and `usage_update` arrives

## Goals / Non-Goals

**Goals:**
- Reconstruct active streaming state on page refresh/reconnect
- Show agent box with accumulated thought and message content
- Restore user experience seamlessly

**Non-Goals:**
- Handle multiple simultaneous clients (existing limitation)
- Persist partial streaming state to disk
- Change the chunk accumulation logic

## Decisions

**1. Send streaming state alongside history on reconnect**

When a chat WebSocket connects, after sending history, check buffers and send current state:

```
// Pseudocode
const thoughtContent = thoughtBuffers.get(sessionId)
const messageContent = streamingBuffers.get(sessionId)

if (thoughtContent || messageContent) {
  ws.send(JSON.stringify({
    type: 'streaming_state',
    thoughtContent,
    messageContent,
  }))
}
```

**Why not a separate reconnect message?** Simpler - one round trip instead of two. The streaming state is only relevant immediately after connect.

**2. Frontend reconstructs state by appending buffered content**

The frontend already has `startThoughtSection()`, `appendThoughtChunk()`, `endThoughtSection()`, and `appendMessageChunk()`. We compose them:

1. Set internal flag to prevent editable bubble creation
2. Call `startThoughtSection()` (creates agent box with thought section)
3. Append buffered thought content
4. Call `endThoughtSection()`
5. Append buffered message content
6. Real-time chunks continue as normal

**Why not send separate `thought_start`/`thought_end` events?** The chunks alone are sufficient - the frontend's `startThoughtSection()` creates the thought section structure, and we just append the accumulated content.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Agent completes before buffer is sent | `usage_update` will clear buffers and send final state - client handles both |
| Multiple clients with different streaming states | Acceptable limitation - each client reconstructs independently |
| Race between reconnect and buffer clear | `usage_update` arrives after buffer content is already sent on reconnect; client handles duplicate chunks gracefully |
