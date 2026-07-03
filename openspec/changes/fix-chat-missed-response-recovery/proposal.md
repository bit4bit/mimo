## Why

Sometimes after a user sends a prompt in a chat thread, the assistant response never appears in the UI — the only way to see it is a full browser reload. The response is generated and persisted correctly (reload always shows it), so the defect is purely in **live delivery and recovery**, not in generation or storage.

Reload is the tell. The server's chat WebSocket `open` handler already re-pushes full `history` on every (re)connection (`handlers.ts:990-1041`), so a *clean* disconnect/reconnect self-heals within the ~3s reconnect delay. The fact that a **manual** reload is required means the socket is not cleanly reconnecting when the message is lost. Two independent mechanisms in the current code produce exactly this symptom:

1. **Zombie WebSocket (no heartbeat).** There is no ping/pong or keepalive anywhere in the chat WebSocket (`public/js/chat.js`, `src/api/websocket/handlers.ts`). A half-open or dead socket — caused by laptop sleep, network changes, NAT rebinding, or an idle-timeout proxy that drops the connection without a close frame — stays `readyState === OPEN` in the browser. `onclose` never fires, so the 3s reconnect (`chat.js:1101-1110`) never runs, and every `prompt_received` / `message_chunk` / `prompt_completed` the server broadcasts is written into a dead pipe. The user sees nothing until they manually reload and build a fresh socket.

2. **Gate silent-drop on a live socket.** `shouldAcceptStreamingEvent` (`chat.js:1500-1562`) rejects streaming events when `ChatState.currentPromptId` is null or unrecoverably mismatched. It only self-heals (via `request_replay`) when `ChatState.streaming.messageElement` already exists (`chat.js:1505`). When the gate rejects an event and that precondition is not met, the chunks are dropped with no recovery — and because the socket stays open, the server never re-pushes history on its own. Manual reload is the only path back.

`fix-streaming-promptid-silent-drop` closed the most common variants of (2), but the "unrecoverable rejection with no streaming element" branch remains, and cause (1) is unaddressed entirely.

## What Changes

- **Add a WebSocket heartbeat with zombie detection.** Client sends a periodic `ping`; server replies `pong`. If the client misses N consecutive pongs it treats the socket as dead, force-closes it, and lets the existing reconnect path run — which re-pushes `history` and reconciles the missed response. This converts silent zombie sockets into ordinary self-healing reconnects.
- **Make the client gate always recoverable.** When `shouldAcceptStreamingEvent` rejects an event and cannot recover in place, the client requests a replay (reconciling against server history) regardless of whether a `messageElement` exists — closing the residual silent-drop hole.
- **Reconcile on reconnect defensively.** On WebSocket reopen, the client explicitly requests a history replay for the active thread so a completed-while-disconnected response is always reconciled, not only when the server's proactive `open`-handler push happens to match the client's active thread.

## Capabilities

### New Capabilities

- `chat-connection-reliability`: heartbeat/keepalive, zombie-socket detection, and reconnect-driven history reconciliation for the chat WebSocket

### Modified Capabilities

- `streaming-recovery`: the client SHALL request a replay on **any** unrecoverable streaming-event rejection, not only when a streaming element is already present

## Impact

- Frontend: `packages/mimo-platform/public/js/chat.js` (heartbeat timers, gate recovery, reconnect reconcile)
- Server: `packages/mimo-platform/src/api/websocket/handlers.ts` (`ping`/`pong` message handling)
- No API changes, no persistence changes, no breaking changes — `ping`/`pong` are additive WebSocket messages that old clients simply never send
