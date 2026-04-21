## Context

The chat pipeline already supports typed ACP updates (`thought_chunk`, `message_chunk`, `usage_update`, `tool_call`, `tool_call_update`). However, `available_commands_update` is intentionally suppressed in the opencode provider mapping. This blocks command discovery in the session UI even though ACP already publishes command metadata.

## Goals / Non-Goals

**Goals:**
- Surface ACP-provided command availability in session chat UI.
- Keep behavior session/thread scoped, matching existing chat stream isolation.
- Provide low-friction UX for discovery and insertion into chat input.
- Preserve existing send/approval flow (user still submits prompt explicitly).

**Non-Goals:**
- Executing commands directly from UI without user prompt submission.
- Defining provider-specific command semantics beyond rendering/insertion.
- Persisting command lists into chat history.

## Decisions

### D1: Forward `available_commands_update` as structured event

**Decision:** Provider mapping returns a non-null mapped type for `available_commands_update`; `AcpClient` routes payload to a dedicated callback rather than generic assistant message content.

**Rationale:** Commands are metadata, not assistant prose. Routing via dedicated event avoids polluting transcripts.

### D2: Store commands in platform memory by stream key

**Decision:** Keep latest command set in-memory keyed by `streamKey(sessionId, chatThreadId)` and broadcast updates to active WebSocket subscribers.

**Rationale:** Commands are ephemeral capabilities tied to active ACP context and can change during session lifetime.

### D3: Dual-entry UX (button + slash trigger)

**Decision:**
- Add a `Commands` button near chat input to open a picker/list.
- Also open filtered picker when user types `/`.
- Selection inserts command text/template into the input cursor position.

**Rationale:** Supports both discoverability (button) and expert speed (slash trigger).

### D4: Insert-only safety model

**Decision:** Selecting a command never auto-sends. User must review/edit and click Send.

**Rationale:** Maintains explicit user intent and aligns with existing approval/safety expectations.

### D5: Graceful fallback for empty/unsupported providers

**Decision:** If no command data is available, hide picker content and show no-op/empty state without errors.

**Rationale:** Keeps compatibility with providers that do not emit command updates.

## Data Shape

Platform/UI treat command payload as opaque-but-renderable list, normalizing minimal fields when present:

```ts
type AvailableCommand = {
  name: string;
  description?: string;
  template?: string;
};
```

If provider payload differs, adapter normalizes best-effort (`name` required for rendering).

## Risks / Trade-offs

- Payload schema variance across providers may require defensive parsing.
- Very large command lists can overwhelm compact chat input area; picker must support filtering.
- In-memory only caching means full page reload depends on new ACP update emission.

## Migration Plan

Additive change only.

1. Ship mimo-agent forwarding support and tests.
2. Ship mimo-platform routing + UI picker support and tests.
3. Validate manual flows for button/open, slash/open, insert behavior, and no transcript pollution.
