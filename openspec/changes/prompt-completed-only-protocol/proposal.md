## Why

`usage_update` is currently acting as an implicit "done" signal in some code paths. But `usage_update` can arrive mid-stream (e.g. between thinking phases), causing premature finalization and split boxes. The correct end-of-turn signals are `prompt_completed` (success) and `prompt_cancelled` (cancelled). `usage_update` should only ever update the usage bar.

## What Changes

- `usage_update` becomes a **display-only** event. It updates the usage bar (tokens, context, cost) and nothing else. No finalization, no persistence, no buffer clearing.
- `prompt_completed` becomes the **sole signal for finalization and persistence**. When it arrives, the platform saves the assembled message, broadcasts completion to UI, and clears buffers.
- `prompt_cancelled` becomes the **signal for cancellation cleanup**. When it arrives, the platform finalizes the streaming box, saves any partial content with `cancelled: true`, and clears buffers.
- Remove any fallback timers or work-arounds in the UI that were compensating for `usage_update` being treated as the done signal.

## Capabilities

### Modified Capabilities

- `chat-streaming-pipeline`: `usage_update` no longer triggers persistence or buffer clearing; `prompt_completed` and `prompt_cancelled` take over those responsibilities.

## Impact

- `packages/mimo-platform/src/domain/sessions/streaming-pipeline.ts` — remove persistence/buffer-clear from `handleUsageUpdate`; ensure `handlePromptCompleted` and `prompt_cancelled` handler do persistence
- `packages/mimo-platform/src/domain/agents/message-router.ts` — update routing so `prompt_completed`/`prompt_cancelled` trigger persistence; `usage_update` only touches usage display
- `packages/mimo-platform/public/js/chat.js` — remove fallback timer; `prompt_completed`/`prompt_cancelled` finalize; `usage_update` only updates usage footer
- Tests across both packages updated
