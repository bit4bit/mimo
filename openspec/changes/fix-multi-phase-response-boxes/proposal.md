## Why

When using the Claude agent provider, a single user prompt can trigger **multi-phase responses** where the agent emits `message_chunk` data, then `usage_update`, then additional `message_chunk` data for the same prompt. The current streaming pipeline treats each `usage_update` as a signal that the entire response is complete, causing the UI to:
1. Finalize the first chunk as a completed message
2. Leave the second chunk stranded in a "● Received, processing..." box that never resolves

This degrades the chat experience because users see their response split across multiple agent boxes, with the last one permanently stuck.

## What Changes

- **Modify `ChatStreamingPipeline`** (`mimo-platform`): Change `usage_update` handling so it only finalizes and saves the message when the agent truly signals completion, not after every intermediate phase
- **Modify `AcpClient`** (`mimo-agent`): Forward the `prompt()` completion signal to the platform as a new `prompt_completed` message so the platform knows when the entire response is done
- **Modify platform message router** (`mimo-platform`): Handle the new `prompt_completed` message type and route it through the streaming pipeline as the definitive end-of-stream signal
- **Modify chat UI** (`mimo-platform`): Treat `prompt_completed` as the signal to finalize the streaming message, rather than `usage_update`

## Capabilities

### New Capabilities
- *(none — this is a behavioral fix to existing capability)*

### Modified Capabilities
- `chat-streaming-pipeline`: The end-of-stream signal changes from `usage_update` to `prompt_completed`. `usage_update` becomes an intermediate metadata event that updates usage display without finalizing the message.
- `agent-processing-feedback`: Agent now emits `prompt_completed` after `acpClient.prompt()` resolves, providing a clear lifecycle boundary for the UI.

## Impact

- `packages/mimo-platform/src/domain/sessions/streaming-pipeline.ts` — split `usage_update` handling into metadata broadcast (always) vs message finalization (only on `prompt_completed`)
- `packages/mimo-agent/src/acp/client.ts` — add `prompt_completed` callback and emit after `prompt()` resolves
- `packages/mimo-agent/src/index.ts` — wire `prompt_completed` through WebSocket to platform
- `packages/mimo-platform/src/domain/agents/message-router.ts` — handle `prompt_completed` message type
- `packages/mimo-platform/public/js/chat.js` — finalize streaming on `prompt_completed` instead of `usage_update`
- No breaking API changes; additive message type only
