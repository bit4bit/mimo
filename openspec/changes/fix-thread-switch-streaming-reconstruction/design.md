## Context

The frontend is vanilla JavaScript with two module-global state objects (`ChatState`, `ChatThreadsState`) — no framework state store. When switching threads, `switchToThread` (`chat-threads.js:199`) fires two concurrent WebSocket requests: `request_replay` (returns finalized JSONL history) and `request_state` (returns `streaming_state` with the in-memory partial response, plus `plan` and `available_commands_update`).

The server processes both in arrival order. `request_replay`'s handler does `await loadHistory` (filesystem I/O, yields the event loop); `request_state`'s handler reads in-memory buffers synchronously. Under filesystem latency the `streaming_state` reply can land on the client **before** the `history` reply. The client's `loadChatHistory` (`chat.js:3514`) unconditionally does `container.innerHTML = ""`, wiping the streaming bubble that `handleStreamingState` (`chat.js:2412`) just built — so the partial vanishes and only reappears when the next live chunk arrives.

The recovery path in `shouldAcceptStreamingEvent` (`chat.js:1500-1562`) requests `request_replay` when chunks are dropped, but `request_replay` only returns finalized JSONL — it cannot recover the in-memory partial.

Prior changes (`fix-chat-thread-switch-message-loss`, `fix-streaming-promptid-silent-drop`) added detached-node guards and promptId self-healing but never verified the active-streaming-switch case (tasks 5.1–5.3 unchecked).

## Goals / Non-Goals

**Goals:**
- Guarantee the in-progress partial response renders immediately when switching to a streaming thread, regardless of `history` vs `streaming_state` arrival order.
- Make the drop-recovery path capable of fetching the in-memory partial.
- Keep `request_replay` and `request_state` as separate concerns.
- Keep `plan` and `available_commands_update` applying immediately on arrival (they render into separate panels untouched by the history wipe).

**Non-Goals:**
- No server-side changes. The existing `request_replay`/`request_state` contracts are sufficient.
- No virtualization or pagination of message rendering (separate concern from streaming reconstruction).
- No changes to how `streaming_state` is pushed proactively mid-stream.
- No changes to the JSONL persistence model (partial responses remain in-memory only until completion/cancel).

## Decisions

### Decision 1: Buffer `streaming_state` client-side when history hasn't loaded

Add two per-switch fields to `ChatState`:
- `historyLoaded` (boolean) — `false` until `loadChatHistory` finishes for the current switch.
- `pendingStreamingSnapshot` (object | null) — holds a `streaming_state` payload that arrived before history.

In `handleStreamingState`: if `historyLoaded === false`, store `data` into `pendingStreamingSnapshot` and return without building the bubble. If `historyLoaded === true`, apply normally (today's behavior).

In `loadChatHistory`: after rendering finalized messages and setting `historyLoaded = true`, check `pendingStreamingSnapshot`; if present, call `handleStreamingState(pendingStreamingSnapshot)` then clear it.

**Why this over server-side sequencing:** The race exists because of the async `await loadHistory` yielding. Server-side fixes (defer `streaming_state` send until after `history` send) would require threading sequencing guarantees through `handlers.ts` and coupling two independent handlers. Client-side buffering is local, testable, and survives any future server ordering changes.

**Why not defer sending `request_state` until after `history` arrives:** We chose the layered approach so `plan` and `available_commands_update` remain snappy (they apply immediately, regardless of `streaming_state` gating). Deferring the whole `request_state` send would also delay those.

### Decision 2: Per-switch scope for the buffer/flag

`historyLoaded` and `pendingStreamingSnapshot` are reset in `prepareThreadSwitch` (`chat.js:2341`). This ensures a delayed reply from a prior switch cannot bleed into a new thread: a stale `streaming_state` arriving after a new switch sees `historyLoaded === false` and gets buffered for the new thread — but since `prepareThreadSwitch` also cleared the old streaming references, there is no stale bubble to wipe.

**Alternative considered:** Thread-id stamping (check `data.chatThreadId === activeThreadId` before buffering). Already done today for `history` (`chat.js:1297-1303`); the `streaming_state` handler should apply the same guard before buffering to drop replies from a non-active thread outright.

### Decision 3: Safety timeout

If `streaming_state` was buffered but `history` never arrives (server error, WS drop, slow disk), the user is left waiting. Add a ~2s fallback timer started when `pendingStreamingSnapshot` is set. If it fires and `historyLoaded` is still false, apply the snapshot anyway (build bubble, render partial). This mirrors the existing 2s fallback at `chat-threads.js:319`.

**Trade-off:** Applying without history means the user sees the partial but not prior finalized messages. This is acceptable — the user switched *to* a streaming thread specifically to watch the active response, and finalized history will catch up or can be refreshed. The alternative (wait forever) is worse.

### Decision 4: Recovery path requests `request_state` instead of `request_replay`

In `shouldAcceptStreamingEvent` (`chat.js:1500-1562`), the drop-recovery branch currently sends `request_replay`. Change it to send `request_state`. Only `request_state` returns `streaming_state` with the in-memory partial; `request_replay` returns only finalized JSONL and cannot recover the in-progress response.

Keep the `replayRequested` flag to prevent duplicate requests — rename conceptually to `stateRequested` if desired, but the flag behavior (set on request, cleared when the snapshot is applied) is unchanged.

**Why not send both:** `request_state` returns `streaming_state` which self-heals `currentPromptId` (per `fix-streaming-promptid-silent-drop`), which in turn unblocks `request_replay`-equivalent recovery via normal chunk acceptance. Sending `request_replay` separately would also wipe the DOM (`loadChatHistory`) and clobber any buffered snapshot — counterproductive during recovery.

## Risks / Trade-offs

- **[Stale snapshot applied after a second switch]** → `prepareThreadSwitch` resets `historyLoaded`/`pendingStreamingSnapshot`, and `streaming_state` is guarded by `chatThreadId === activeThreadId` before buffering. A late reply from a prior thread is dropped.
- **[Safety timeout applies a snapshot without history]** → Acceptable degradation; the user sees the active partial (their primary interest). History will arrive or can be refreshed. The 2s threshold matches existing UX tolerance (`chat-threads.js:319`).
- **[Memory: snapshot held in memory]** → Negligible — one object, scoped to a single switch, cleared on apply or on next `prepareThreadSwitch`.
- **[Recovery path change could mask a real replay need]** → `request_state` returns `streaming_state` which restores `currentPromptId`; once chunks flow again, normal history is visible via the live stream. If the thread is *not* streaming (truly needs replay of finalized messages), `request_state` returns no `streaming_state` (empty buffers, no `promptInFlight`) and the user can manually refresh. This is a behavior change from the current silent-drop behavior, which was itself broken (it requested a thing that couldn't recover the partial). If finalized-only replay is needed in a non-streaming drop scenario, that's a separate concern — this change scopes to the streaming case.