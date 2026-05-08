## Why

The "Received, processing..." indicator that appears after sending a chat message is pure frontend DOM state. When users switch chat threads or reload the browser, this indicator disappears permanently because the server does not track whether a prompt is currently being processed. The server only sends `streaming_state` when accumulated content buffers have data, but the indicator appears before any chunks arrive — leaving a gap where the processing state is invisible.

## What Changes

- **Track prompt-in-flight state on server**: Add a per-thread `promptInFlight` flag to `ChatStreamingPipeline` that is set when `prompt_received` arrives and cleared when `usage_update` or `error_response` arrives
- **Send `streaming_state` for in-flight prompts**: On `request_state`, if the agent is alive and a prompt is in flight for that thread (even with empty content buffers), send `streaming_state` so the frontend can reconstruct the indicator
- **Frontend: insert streaming element for empty reconstructed state**: Update `handleStreamingState` to create the streaming DOM element even when `messageContent` and `thoughtContent` are empty, ensuring the "Received, processing..." indicator is shown
- **Clear on thread switch**: Ensure `prepareThreadSwitch` still clears the indicator appropriately when switching away from an active thread

## Capabilities

### New Capabilities

- _(none)_

### Modified Capabilities

- `chat-streaming-state`: Server must send `streaming_state` when agent is processing a prompt even if no chunks have been received yet. Client must reconstruct streaming UI from empty state.
- `chat-threads`: Thread switching must properly handle the prompt-in-flight indicator state.

## Impact

- Server: `packages/mimo-platform/src/domain/sessions/streaming-pipeline.ts`, `packages/mimo-platform/src/domain/agents/message-router.ts`
- WebSocket handlers: `packages/mimo-platform/src/api/websocket/handlers.ts`
- Frontend: `packages/mimo-platform/public/js/chat.js`
- No breaking changes to APIs or message formats
