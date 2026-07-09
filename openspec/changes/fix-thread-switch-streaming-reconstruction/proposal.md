## Why

When a user switches to a chat thread whose agent is mid-response (actively streaming), the in-progress partial response does not render immediately — the user sees a blank/existing messages and only when the next live stream chunk arrives does the partial begin to appear. The partial response is available server-side at switch time (held in-memory in `streamingBuffers`/`thoughtBuffers`) and is delivered via `streaming_state`, but a client-side ordering race lets `loadChatHistory` wipe the streaming bubble that `handleStreamingState` just built. The recovery path (`shouldAcceptStreamingEvent`) also requests `request_replay` — which returns only finalized JSONL, not the in-memory snapshot — so it cannot recover the partial. Prior fixes (`fix-chat-thread-switch-message-loss`, `fix-streaming-promptid-silent-drop`) mitigated adjacent symptoms but never verified the active-streaming-switch scenario (tasks 5.1–5.3 still unchecked).

## What Changes

- Client buffers a `streaming_state` snapshot when it arrives before `loadChatHistory` has run for the current switch, and applies it once history finishes rendering. This eliminates the ordering race regardless of which reply lands first.
- Client fix recovery path: when `shouldAcceptStreamingEvent` drops chunks due to null/mismatched `currentPromptId`, request `request_state` (which returns the in-memory snapshot) instead of `request_replay` (which returns only finalized JSONL history).
- Client adds a safety timeout (~2s): if `streaming_state` was buffered but `history` never arrives, apply the snapshot anyway so the user is not left waiting forever.
- Client resets the per-switch buffer/flag (`historyLoaded`, `pendingStreamingSnapshot`) in `prepareThreadSwitch` so a delayed reply from a prior switch cannot bleed into a new thread.
- `plan` and `available_commands_update` continue to apply immediately on arrival — only the `streaming_state` application is gated. They render into separate panels that the history wipe does not touch.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `chat-streaming-state`: Add requirement that the client SHALL buffer `streaming_state` when history has not yet loaded for the current thread switch, and apply it after history completes.
- `streaming-recovery`: Change the recovery request target from `request_replay` to `request_state`, since only `request_state` returns the in-memory streaming snapshot.

## Impact

- Frontend (`packages/mimo-platform/public/js/chat.js`): `handleStreamingState`, `loadChatHistory`, `prepareThreadSwitch`, `shouldAcceptStreamingEvent` — client-only changes.
- Frontend (`packages/mimo-platform/public/js/chat-threads.js`): `switchToThread` unchanged — `request_replay` and `request_state` continue to be sent concurrently.
- No server-side changes. `request_replay` and `request_state` remain separate; their existing contracts are sufficient.
- No breaking changes to WebSocket protocol.