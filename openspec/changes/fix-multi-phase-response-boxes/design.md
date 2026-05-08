## Context

The current architecture treats `usage_update` as the definitive end-of-response signal. This works for single-phase providers (like Opencode) where one `usage_update` truly means the response is complete. However, the Claude ACP provider sends `usage_update` as an intermediate event between content phases — after initial content but before follow-up content that may come after tool execution or reasoning continuation.

The result is a split message: the first chunk is finalized and saved, while subsequent chunks create a new orphaned streaming box that never receives a finalization signal.

The fix requires introducing a new lifecycle event `prompt_completed` that is emitted by mimo-agent only when `acpClient.prompt()` actually resolves, and making the streaming pipeline treat this as the sole finalization signal.

## Goals / Non-Goals

**Goals:**

- Prevent message splitting across multiple chat boxes for multi-phase agent responses
- Ensure every streaming message box is properly finalized (no orphaned "Received, processing..." states)
- Maintain backward compatibility with single-phase providers
- Keep `usage_update` functional for displaying cost/token metadata without side effects

**Non-Goals:**

- Changing the ACP provider protocol or how providers emit `usage_update`
- Modifying the agent's internal content generation logic
- Adding retry or recovery logic for dropped messages

## Decisions

### 1. Introduce `prompt_completed` as a new message type

**Rationale:** We need a signal that means "the agent's `prompt()` call is fully done" rather than "the provider emitted usage metadata." These are semantically different.

- **Alternative considered:** Reinterpret `usage_update` to not finalize. Rejected because single-phase providers rely on `usage_update` as the end signal, and we don't want to break them.
- **Alternative considered:** Add a flag to `usage_update` (e.g., `isFinal`). Rejected because it couples two concerns (metadata vs lifecycle) and requires provider changes.

### 2. `usage_update` becomes a pure metadata event

**Rationale:** Decoupling metadata display from message finalization lets us handle multi-phase responses cleanly. The UI updates cost/token display on `usage_update` but only removes the streaming indicator on `prompt_completed`.

### 3. Pipeline accumulates across multiple `usage_update` events

**Rationale:** If a provider sends `usage_update` mid-stream, we should not clear buffers. Buffers are only cleared on `prompt_completed`. This means `handleUsageUpdate` broadcasts metadata but does NOT call `buildAndClearAssistantContent`.

### 4. Backward compatibility via additive change

**Rationale:** Existing single-phase providers will continue to work because they emit `usage_update` as their last event. The UI will simply also wait for `prompt_completed`, which for single-phase providers arrives immediately after (or we can make mimo-agent emit it immediately after `usage_update` for backward compatibility).

## Risks / Trade-offs

- **[Risk]** UI clients that expect `usage_update` to mean "done" will need update. **Mitigation:** This is a controlled change to our own UI; we control both producer and consumer.
- **[Risk]** If `prompt_completed` is lost (network blip), the streaming box stays stuck. **Mitigation:** This is no worse than current behavior where the box already gets stuck. Future improvement: add timeout-based fallback.
- **[Risk]** `usage_update` metadata may be stale if final phase changes token count. **Mitigation:** The last `usage_update` before `prompt_completed` is the authoritative one; earlier ones are intermediate snapshots.

## Migration Plan

No migration needed. This is a backward-compatible additive change:

1. Deploy mimo-agent with `prompt_completed` emission
2. Deploy platform with `prompt_completed` handling
3. Old mimo-agents continue to work — they just won't emit `prompt_completed`, so platform falls back to existing `usage_update` behavior (or we can make platform auto-finalize if no `prompt_completed` after a grace period)
