## Context

Today, tool usage is visible only in transient permission cards (`permission_request`) in `chat.js`. After a user picks an option, the platform sends `permission_response` back to the agent and broadcasts `permission_resolved`, which removes the card. The finalized assistant response is persisted on `usage_update`, but it only includes text/thoughts/duration metadata.

Because the assistant message is the durable artifact users review later, tool-call details need to be attached to that message and rendered in the same message box.

## Goals / Non-Goals

**Goals:**
- Show tool-call information in the assistant message box after a response completes.
- Include both approved and rejected/cancelled tool calls in that summary.
- Persist that information in chat history for reload/replay.
- Keep the existing approval interaction unchanged.

**Non-Goals:**
- Building a full audit log across sessions.
- Rendering raw tool input/output payloads.
- Changing ACP provider APIs.

## Decisions

### D1: Track per-turn tool call decisions in platform memory

**Decision:** Extend platform-side permission tracking to keep `toolCall` payload plus decision outcome (`selected` option, `cancelled`, or explicit reject), then stage tool-call decisions in a per-session turn buffer until `usage_update` finalizes the assistant message.

**Rationale:** `usage_update` is already the turn-finalization boundary and message persistence point.

### D2: Persist compact tool-call decision summary in message metadata

**Decision:** Save `metadata.toolCalls` on assistant messages as an array of objects with status:

```json
{
  "title": "Edit file",
  "kind": "edit",
  "toolCallId": "tc-123",
  "decision": "approved",
  "optionKind": "allow_once",
  "locations": [{ "path": "src/index.ts", "startLine": 42 }]
}
```

Rejected or cancelled examples:

```json
{
  "title": "Run shell command",
  "kind": "bash",
  "toolCallId": "tc-124",
  "decision": "rejected",
  "optionKind": "reject_once"
}
```

```json
{
  "title": "Edit file",
  "kind": "edit",
  "toolCallId": "tc-125",
  "decision": "cancelled"
}
```

**Rationale:** The existing `metadata` field is extensible and avoids schema changes.

### D3: Render tool-call summaries inline in assistant message cards

**Decision:** Add a compact "Tools used" block below assistant message content in both SSR (`ChatBuffer.tsx`) and client rendering (`chat.js`).

**Rationale:** Users asked for visibility in the agent message box itself, not only in temporary banners/cards.

### D4: "Tools used" block includes decision status, not only executed calls

**Decision:** For this iteration, include all resolved tool-call decisions in the same completed turn. UI labels each entry by `decision` (`approved`, `rejected`, `cancelled`) and may display `optionKind` when present.

**Trade-off:** An approved decision is still a best-effort proxy for execution success; it does not guarantee completion. Future work can add explicit tool-result events when ACP exposes them consistently.

### D5: Title-first UI with unfold for details

**Decision:** In the assistant message box, each tool-call row shows only the tool title in collapsed state. Clicking the row toggles an expanded detail panel.

Expanded panel includes:
- decision (`approved` / `rejected` / `cancelled`)
- tool kind
- selected option kind when present
- locations list when present

**Rationale:** Keeps the message box readable by default while still providing audit/debug detail on demand.

## Risks / Trade-offs

- If a turn is interrupted before `usage_update`, approved tool calls may not be attached to a persisted assistant message.
- Provider differences may produce uneven tool metadata richness (e.g., missing locations).
- Message cards can become noisy if many tool calls occur; UI should remain collapsed/compact by default.

## Migration Plan

Additive change only. Older assistant messages without `metadata.toolCalls` remain unchanged and render normally.
