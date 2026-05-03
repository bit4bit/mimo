## Context

The current streaming architecture only tracks **accumulated content buffers** (`streamingBuffers`, `thoughtBuffers`). The `prompt_received` message is a pure broadcast with no server-side state. When a user sends a message:

1. Frontend sends HTTP `user_message` to server
2. Server forwards to agent
3. Agent broadcasts `prompt_received` to all clients
4. Frontend creates streaming DOM element with "Received, processing..."
5. Agent eventually sends chunks → buffers fill → `streaming_state` includes content

The gap: if the user switches threads or reloads between steps 4-5, the frontend has no way to know a prompt is in flight because:
- `request_state` only checks content buffers (empty)
- `prompt_received` was ephemeral broadcast, not persisted
- `isAgentAlive` only tells us the agent process exists, not that it's processing THIS thread

## Goals / Non-Goals

**Goals:**
- Ensure "Received, processing..." indicator survives thread switches
- Ensure indicator survives browser reloads
- Do this with minimal changes to existing architecture

**Non-Goals:**
- Redesigning the entire streaming protocol
- Adding new WebSocket message types
- Changing agent behavior

## Decisions

### 1. Add `promptInFlight` Set to ChatStreamingPipeline

Use a `Set<string>` (keyed by `sessionId:threadId`) to track which threads have an uncompleted prompt.

```typescript
private promptInFlight = new Set<string>();

setPromptInFlight(sessionId, threadId) { this.promptInFlight.add(streamKey(...)); }
clearPromptInFlight(sessionId, threadId) { this.promptInFlight.delete(streamKey(...)); }
isPromptInFlight(sessionId, threadId) { return this.promptInFlight.has(streamKey(...)); }
```

**Set locations:**
- **Set**: `handlePromptReceived` in `message-router.ts` (when agent broadcasts `prompt_received`)
- **Clear**: `handleUsageUpdate` and `handleErrorResponse` in `message-router.ts` (when the turn ends)

**Rationale**: The pipeline is the natural home for per-session/thread streaming state. The `message-router` is the gateway for agent → platform messages, making it the right place to intercept these lifecycle events.

### 2. Modify `request_state` handler to check `isPromptInFlight`

In `websocket/handlers.ts`:

```typescript
const stateSnap = pipeline.getStreamingSnapshot(sessionId, stateThreadId);
const hasContent = stateSnap.thoughtContent || stateSnap.messageContent;
const isProcessing = pipeline.isPromptInFlight(sessionId, stateThreadId);

if ((hasContent || isProcessing) && chatService.isAgentAlive(sessionId)) {
  ws.send({ type: "streaming_state", ... });
}
```

**Rationale**: Reuses existing `streaming_state` message type. No new protocol needed.

### 3. Frontend: insert streaming element even for empty content

Update `handleStreamingState` to always insert the streaming element:

```javascript
function handleStreamingState(data) {
  const { thoughtContent, messageContent } = data;
  
  ChatState.streaming.reconstructed = true;
  
  removeEditableBubble();
  
  if (thoughtContent) {
    insertStreamingMessage();
    insertThoughtSection();
    // ... update thought
  }
  
  // Always insert message element for reconstructed state
  if (!ChatState.streaming.messageElement || !ChatState.streaming.messageElement.isConnected) {
    insertStreamingMessage();
  }
  
  if (messageContent) {
    ChatState.streaming.content += messageContent;
    updateMessageContent(messageContent);
  }
  
  // ... fallback timeout
}
```

**Rationale**: The streaming element is the container for the indicator. Even with empty content, we need it visible.

### 4. Clear prompt-in-flight on thread switch

`prepareThreadSwitch` should remain as-is for clearing the local DOM. The server-side `promptInFlight` will naturally clear when `usage_update`/`error_response` arrives, regardless of which thread is active in the UI.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Stale `promptInFlight` if agent crashes mid-prompt | The flag is also cleared on WebSocket disconnect. Add `clearPromptInFlight` to agent disconnect handler. |
| False positive indicator if agent is alive but processing a different thread | The Set is keyed by `sessionId:threadId`, so it's thread-scoped. Correct. |
| `streaming_state` with empty content triggers unnecessary DOM operations | The `handleStreamingState` already has a guard: `if (!ChatState.streaming.messageElement)` prevents duplicates. |

## Open Questions

- Should `promptInFlight` also be cleared when a new `prompt_received` arrives for the same thread? (Agent pipeline should prevent double-prompts, but worth considering.)
