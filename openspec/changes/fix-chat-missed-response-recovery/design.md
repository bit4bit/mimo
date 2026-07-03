## Context

The chat thread response path is: agent → `AgentMessageRouter` → `ChatStreamingPipeline` → `broadcastToSession` → all WebSocket clients for that `sessionId` → client filters by `activeThreadId` and appends to the DOM. Streaming chunks live in in-memory pipeline buffers only; on `prompt_completed` the assembled message is persisted to history (DB) and the buffers are deleted (`streaming-pipeline.ts:333-336, 357-375, 409-432`).

Recovery today has three moving parts:

1. **Server `open` handler** (`handlers.ts:990-1041`) — on every new socket, proactively sends `history` for the session's `activeChatThreadId`, then a `streaming_state` if live buffers are non-empty.
2. **`request_replay`** (`handlers.ts:617-632`) — returns full `history` from `chatService.loadHistory`; client `loadChatHistory` wipes the DOM and rebuilds.
3. **`request_state`** (`handlers.ts:375-401`) — returns `streaming_state` only if there is live buffered content or `promptInFlight`. It cannot deliver a response that already completed.

Because (1) fires on every connect, a **clean** reconnect self-heals. So a bug that requires a **manual reload** must be a case where the socket does not cleanly reconnect, or where a live socket drops the stream without ever reconnecting.

## Root Causes

### RC1 — Zombie WebSocket (no heartbeat)

There is no ping/pong or keepalive on the chat WebSocket (verified: no `ping`/`pong`/`heartbeat`/keepalive handling in `chat.js` or `handlers.ts`). A dead-but-`OPEN` socket (sleep/resume, network switch, NAT/idle-proxy drop without a close frame) never fires `onclose`, so the 3s reconnect (`chat.js:1101-1110`) never runs. The agent's broadcast goes into a dead pipe and is lost. Only a manual reload builds a fresh socket, which triggers the `open`-handler history push.

### RC2 — Gate silent-drop with no reconcile

`shouldAcceptStreamingEvent` (`chat.js:1500-1562`) drops events when `currentPromptId` is null. It requests a replay only when `ChatState.streaming.messageElement` exists (`chat.js:1505`); otherwise it logs and drops with no recovery. On a live socket the server never re-pushes history unprompted, so the dropped response stays invisible until a manual reload.

## Goals / Non-Goals

**Goals:**

- Convert zombie/half-open sockets into ordinary reconnects so the existing history re-push reconciles the missed response.
- Guarantee the client requests a replay on any unrecoverable streaming-event rejection.
- Guarantee that a reconnect reconciles the active thread's history even when the server's proactive push targets a different active thread.

**Non-Goals:**

- Redesigning the streaming protocol or the `prompt_received` / `prompt_completed` lifecycle.
- Server-side per-client delivery acknowledgements or a persistent outbound message queue (heavier than needed; history-on-reconnect already provides the source of truth).
- Thread-switch-specific message loss (covered by `fix-chat-thread-switch-message-loss`) and intra-thread `promptId` restoration (covered by `fix-streaming-promptid-silent-drop`).

## Decisions

### 1. Client-driven heartbeat with server `pong`

The client starts an interval on `onopen` that sends `{ type: "ping" }` every `HEARTBEAT_INTERVAL_MS` (proposed 15s). The server replies `{ type: "pong" }`. The client tracks the last pong time; if `MISSED_PONG_LIMIT` (proposed 2) intervals elapse with no pong, it declares the socket dead, calls `socket.close()`, and clears the interval. The existing `onclose` handler then reconnects.

**Rationale:** Client-driven ping is the reliable direction — browsers cannot send raw WebSocket ping frames from JS, and application-level `ping`/`pong` works uniformly across proxies. Force-closing a suspected-dead socket is what actually triggers `onclose` (which never fires on its own for a zombie).

**Alternative considered — server-driven ping:** Rejected as the sole mechanism; the browser client is the party that needs to detect the dead socket and reconnect, so it must own the liveness timer.

**Guard:** The heartbeat interval is cleared in `onclose` and before starting a new one in `onopen`, so reconnects don't stack timers.

### 2. Reconcile history on reconnect

On `onopen`, in addition to `request_state`, the client sends `request_replay` for the active thread (`chat.js` — alongside the existing `request_state` at 1078-1084). This guarantees the completed-while-disconnected message is reconciled from history even if the server's proactive `open`-handler push used a different `activeChatThreadId` than the client's current thread.

**Rationale:** The server `open` push keys on `sessionRecord.activeChatThreadId`; the client's active thread may differ, in which case the client's `history` filter (`chat.js:1296-1304`) drops it. An explicit client-side replay for the client's active thread removes that dependency.

**Trade-off — double history load on reconnect:** The server `open` push and the client `request_replay` can both deliver `history`. `loadChatHistory` is idempotent (wipes the DOM with `innerHTML = ""` and rebuilds), so a double load is a harmless rebuild, not duplication. Accepted.

**Ordering with live streaming:** `request_replay` returns `history`; any genuinely in-flight turn is re-sent as `streaming_state` (server `open` push and `request_state`) after/independent of history and reconstructed on top, matching the existing reconnect contract in the `chat-streaming-state` capability.

### 3. Replay on any unrecoverable gate rejection

In `shouldAcceptStreamingEvent`, drop the `messageElement` precondition on the recovery branch: whenever the gate is about to reject an event unrecoverably (null `currentPromptId`, or a mismatch with no usable event `promptId`), request a replay (guarded by the existing `replayRequested` flag) instead of silently dropping.

**Rationale:** The streaming element's presence is orthogonal to whether the response should be recovered. Requesting a replay reconciles from history regardless of DOM state.

**Guard:** Keep the existing single-shot `replayRequested` flag (cleared in `loadChatHistory`) so a burst of rejected chunks produces at most one replay.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Heartbeat traffic on many idle sockets | 15s interval, tiny JSON payloads; negligible vs. streaming traffic. Interval is a tunable constant. |
| Aggressive missed-pong threshold force-closes a merely-slow-but-alive socket | `MISSED_PONG_LIMIT = 2` (~30s of silence) tolerates transient latency; reconnect + history reconcile is non-destructive even on a false positive. |
| Replay-on-rejection causes DOM flicker (rebuild from history) | Fires only when chunks are already being dropped (a broken state); a brief rebuild beats an invisible response. Single-shot `replayRequested` flag bounds it. |
| Double `history` on reconnect | `loadChatHistory` is idempotent (full DOM wipe + rebuild); no duplicate messages. |
| Server must handle a new `ping` message type | Additive; unknown types already fall through to a debug log (`handlers.ts:641-642`). Old clients never send `ping`. |
