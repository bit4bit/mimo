## Context

The chat frontend uses `ChatState.currentPromptId` as a gate for all streaming events. Every `thought_start`, `thought_chunk`, `message_chunk`, and `tool_call` event passes through `shouldAcceptStreamingEvent`, which returns `false` if `currentPromptId` is null or doesn't match the event's `promptId`. When this gate rejects an event, the chunk is **silently dropped** — no rendering, no retry, no recovery.

`currentPromptId` can become null or mismatched through:

1. **WebSocket reconnection** — `handleStreamingState` reconstructs the streaming UI from `streaming_state` but never restores `currentPromptId`. Subsequent chunks arrive with the correct `promptId` but `currentPromptId` is null, so `shouldAcceptStreamingEvent` rejects all of them.

2. **Premature `flushPendingPromptCompletion`** — The 120ms timer from a previous prompt can fire after a new prompt starts, clearing `currentPromptId`. While `sendMessage()` calls `flushPendingPromptCompletion()` synchronously before setting the new id, `prompt_received` from the server also calls it, creating a narrow race.

3. **Server `streaming_state` missing `promptId`** — The `StreamingSnapshot` type and `getStreamingSnapshot` method don't track the current `promptId`, so reconnecting clients have no way to know which prompt is in flight.

The existing `fix-chat-thread-switch-message-loss` change addresses thread-switch ghost DOM nodes but does not address this intra-thread `currentPromptId` gate failure.

## Goals / Non-Goals

**Goals:**

- Ensure streaming chunks are never silently dropped due to null or mismatched `currentPromptId`
- Restore `currentPromptId` after WebSocket reconnection so streaming resumes correctly
- Include `promptId` in server streaming state so clients can reconstruct full context
- Make dropped chunks visible via logging for debuggability

**Non-Goals:**

- Redesigning the streaming event protocol or adding new WebSocket message types
- Changing the `prompt_received` / `prompt_completed` lifecycle
- Addressing thread-switch-specific issues (covered by `fix-chat-thread-switch-message-loss`)

## Decisions

### 1. Include `promptId` in `streaming_state` server payload

The server SHALL include the current `promptId` (from `currentPromptByThread`) in the `StreamingSnapshot` and broadcast it as part of `streaming_state`.

**Rationale**: The client needs `promptId` to set `currentPromptId` after reconnection. Without it, `shouldAcceptStreamingEvent` will reject all post-reconnect chunks. The server already tracks this in `currentPromptByThread`.

**Alternative considered**: Client could derive `promptId` from `request_state` response. Rejected — `request_state` doesn't carry streaming metadata, and the timing of the two messages is not guaranteed.

### 2. Restore `currentPromptId` in `handleStreamingState`

When the client receives `streaming_state` with a `promptId`, it SHALL set `ChatState.currentPromptId` to that value.

**Rationale**: This is the minimal fix for the reconnection path. Without it, chunks after reconnect are silently dropped even though the streaming UI was successfully reconstructed.

### 3. Add recovery: request replay when `shouldAcceptStreamingEvent` rejects a chunk

When a streaming event is rejected because `currentPromptId` is null but a streaming element exists (streaming is visually active), the client SHALL send `request_replay` to the server and re-render from the full history.

**Rationale**: Rather than trying to re-accept individual dropped chunks, requesting a fresh replay ensures the client gets a complete, consistent view. This is a recovery path, not a normal flow.

**Alternative considered**: Buffer rejected chunks and replay them in order. Rejected — adds complexity, and chunks may arrive out of order. Replay from server is simpler and more reliable.

**Guard**: Only trigger replay once per incident. Use a flag (`replayRequested`) to prevent duplicate requests if multiple chunks are rejected in sequence.

### 4. Guard `flushPendingPromptCompletion` against clearing a newer prompt

In `handlePromptReceived`, only call `flushPendingPromptCompletion` if the pending completion's `promptId` matches `ChatState.currentPromptId`.

**Rationale**: Prevents a stale timer from the previous prompt from clearing the current one.

### 5. Log rejected streaming events

When `shouldAcceptStreamingEvent` returns `false`, emit `console.warn` with the event type, expected `promptId`, and received `promptId`.

**Rationale**: Makes the failure observable. Previously it was completely silent, making it nearly impossible to diagnose.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Replay on chunk rejection could cause flicker (DOM rebuilt from history) | Replay only fires when chunks are being dropped (already broken state). The brief flicker is better than invisible messages. |
| `streaming_state.promptId` could be stale if prompt completes between snapshot and delivery | Client checks if prompt is still in flight server-side via `promptInFlight`; if not, replay will have the final message in history. |
| Adding `promptId` to `StreamingSnapshot` changes a server interface | The field is additive and optional — old clients ignore it, new clients use it. No breaking change. |
| Recovery replay could cause duplicate messages | `loadChatHistory` wipes the DOM with `container.innerHTML = ""`, so no duplication. |