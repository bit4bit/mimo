## Why

Agent responses are silently lost when the frontend's `shouldAcceptStreamingEvent` gate rejects streaming chunks because `ChatState.currentPromptId` is null or mismatched. This happens randomly due to WebSocket hiccups, message reordering, reconnection without `currentPromptId` restoration, or premature `flushPendingPromptCompletion` calls. The user sees nothing until a browser refresh loads the persisted history from disk. Unlike the thread-switch message loss (tracked separately), this occurs on the same thread without switching.

## What Changes

- **Restore `currentPromptId` on reconnection**: Include `promptId` in `streaming_state` server payload and restore `ChatState.currentPromptId` in `handleStreamingState`
- **Make `shouldAcceptStreamingEvent` recoverable**: When chunks are rejected due to null/mismatched `currentPromptId`, request a replay from the server instead of silently dropping them
- **Guard `flushPendingPromptCompletion` against clearing a newer prompt**: Only flush if the pending promptId matches the current one
- **Log dropped chunks**: Emit `console.warn` when streaming events are rejected so the issue is debuggable

## Capabilities

### New Capabilities

- _(none - this is a bug fix)_

### Modified Capabilities

- `chat-streaming-state`: `streaming_state` payload must include `promptId`; client must restore `currentPromptId` from it on reconnection
- `chat-streaming-pipeline`: Server must include `promptId` in streaming snapshot so reconnecting clients can resume accepting chunks

## Impact

- Frontend: `packages/mimo-platform/public/js/chat.js`
- Server: `packages/mimo-platform/src/domain/sessions/streaming-pipeline.ts`
- No API changes or breaking changes