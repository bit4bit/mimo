## Why

Chat messages that are in-progress or cancelled are lost when users switch between chat threads. This happens because the frontend's streaming state references detached DOM nodes after thread switches, causing streaming content to be appended to invisible elements. Additionally, pending message tracking leaks across threads, and cancelled messages with no content are never persisted.

## What Changes

- **Fix ghost DOM node references**: Clear `ChatState.streaming` references when `loadChatHistory` wipes the DOM, preventing streaming updates from targeting detached nodes
- **Guard against detached nodes**: Verify `messageElement.isConnected` before appending streaming content in `handleStreamingState`
- **Clear pending messages on thread switch**: Reset `ChatState.pendingMessages` when switching threads to prevent duplicate suppression leaks
- **Persist empty cancellations**: Save cancelled assistant messages even when no content chunks were received, so the cancelled state survives thread switches and reloads
- **Sync thread state on reactivation**: Ensure frontend state is properly reconciled with server state when returning to a thread

## Capabilities

### New Capabilities
- *(none - this is a bug fix)*

### Modified Capabilities
- `chat-threads`: Thread switching behavior must properly clear frontend streaming state and pending message tracking
- `chat-streaming-state`: Streaming state reconstruction must guard against detached DOM nodes and verify element connectivity

## Impact

- Frontend: `packages/mimo-platform/public/js/chat.js`, `packages/mimo-platform/public/js/chat-threads.js`
- Server: `packages/mimo-platform/src/domain/sessions/streaming-pipeline.ts`
- No API changes or breaking changes
