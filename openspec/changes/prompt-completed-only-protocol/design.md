## Context

The current streaming protocol has `usage_update` arriving mid-stream (e.g., between thinking phases of a multi-phase response). Some code paths previously treated `usage_update` as an implicit "done" signal, causing premature finalization and split boxes.

The correct design:
- **`usage_update`** = purely informational, updates the usage bar (tokens, context, cost)
- **`prompt_completed`** = end-of-turn for a successful prompt. Triggers finalization + persistence.
- **`prompt_cancelled`** = end-of-turn for a cancelled prompt. Triggers cleanup + saving partial content.

This separates display concerns from lifecycle concerns.

## Goals / Non-Goals

**Goals:**
- Make `usage_update` display-only (no side effects on persistence/finalization)
- Make `prompt_completed` the sole signal for persisting the final assembled message
- Make `prompt_cancelled` the signal for persisting partial content with cancellation metadata
- Remove the 5-second fallback timer in `chat.js` — it was a band-aid for the implicit usage_update-done confusion

**Non-Goals:**
- Changing `usage_update` payload or where it is emitted (agent side stays the same)
- Changing how chunks are buffered or assembled
- Adding new backward-compatibility support

## Decisions

### 1. usage_update is display-only
**Rationale:** `usage_update` can legitimately arrive multiple times during a single turn (e.g. after each phase of a multi-phase response). Treating it as an end signal causes boxes to split. Separating display from lifecycle fixes the root cause.  
**Trade-off:** UI must wait for `prompt_completed` to see the final duration, but the usage bar updates eagerly on `usage_update`.

### 2. prompt_completed triggers persistence
**Rationale:** By the time `prompt_completed` arrives, all `message_chunk` / `thought_chunk` events for that turn have already been delivered. The platform can safely assemble and save.  
**Trade-off:** If the agent crashes between last chunk and `prompt_completed`, the message isn't persisted. This is acceptable — the user can see the streamed content and the agent will restart.

### 3. prompt_cancelled triggers partial persistence
**Rationale:** When the user cancels, the partial streamed content should still be saved (marked `cancelled: true`) so the thread history is complete.  
**Trade-off:** Slight increase in cancelled-turn save logic, but this already exists in `flushAsCancelled`.

### 4. Remove the 5-second fallback timer
**Rationale:** The timer existed because the UI couldn't trust `prompt_completed` to arrive after chunks. With explicit separation of concerns, `prompt_completed` is the one and only end signal — no fallback needed.  
**Trade-off:** None. Simpler code.

## Risks / Trade-offs

- [Risk] If an agent sends `prompt_completed` before the last chunk (race in the SDK), the split-box bug returns.  
→ Mitigation: The agent's `prompt()` resolves after all callbacks for that prompt have been delivered by the SDK. In practice this is reliable. If it proves unreliable, we can add a small `setImmediate` deferral in `AcpClient.prompt()`.
- [Risk] Old cached `chat.js` may still have the fallback timer.  
→ Mitigation: Hard-reload after deployment.

## Open Questions

- Should `prompt_cancelled` carry `duration` the same way `prompt_completed` does?  
→ For now: no. Cancelled turns don't need duration tracking; `flushAsCancelled` already saves with `cancelled: true`.
