## Context

The chat system uses three layers: browser ↔ platform (Hono/Bun) ↔ mimo-agent. Agent responses arrive as a stream of `thought_start` / `thought_chunk` / `thought_end` / `message_chunk` events, finalized by a `usage_update` event. The platform accumulates chunks in `streamingBuffers` and `thoughtBuffers` (Maps keyed by sessionId) and saves the complete message to `chat.jsonl` at `usage_update`.

The `ChatMessage` interface in `chat.ts` already has a `metadata?: Record<string, unknown>` field, which is persisted as JSON in `chat.jsonl`. The browser receives history via a `history` WebSocket event and renders it through `loadChatHistory()` → `insertMessage()` → `renderMessage()`.

## Goals / Non-Goals

**Goals:**
- Record the wall-clock duration of each agent response from first incoming signal to finalization.
- Persist `duration` (formatted string) and `durationMs` (number) in `metadata` of the assistant `ChatMessage` in `chat.jsonl`.
- Display `0m0s · <datetime>` in the Agent message header for both live and history messages.

**Non-Goals:**
- Do not track user message duration.
- Do not change the `usage_update` payload schema visible to mimo-agent; duration is computed server-side.
- Do not add new HTTP endpoints or change existing ones.
- Do not surface duration in the Impact buffer or any other view.

## Decisions

### D1: Start time recorded on `thought_start`, fallback to first `message_chunk`

**Decision**: The platform sets `messageStartTimes.set(sessionId, Date.now())` in the `thought_start` case. If `thought_start` never fires (some providers skip it), the `message_chunk` case sets the start time only if none exists yet.

**Rationale**: `thought_start` is the earliest reliable signal that the agent has begun work. Using `prompt_received` would include platform-to-agent network latency which is not part of the agent's thinking time. Using `usage_update` as end is the only point where we know the response is complete.

### D2: Duration stored in `metadata`, not as a top-level field on `ChatMessage`

**Decision**: `metadata.duration` (e.g. `"1m23s"`) and `metadata.durationMs` (e.g. `83000`) are written; no interface change to `ChatMessage`.

**Rationale**: The `metadata` field already exists for this kind of extensible, optional data. Adding a top-level field would require updating all callers that construct `ChatMessage` literals.

### D3: Duration broadcast in the `usage_update` WebSocket event

**Decision**: The platform adds `duration: string` to the JSON payload of the `usage_update` broadcast. The browser reads `data.duration` in `handleUsageUpdate`.

**Alternative discarded**: A separate `message_finalized` event. Adds complexity for no benefit — `usage_update` already marks end-of-stream.

### D4: `startTime` lives in `ChatState.streaming`, reset with the rest of streaming state

**Decision**: Add `startTime: null` to `ChatState.streaming`. Set it in `handlePromptReceived` (and as fallback in `handleThoughtStart`). Reset it in both `finalizeMessageStream` and `removeStreamingMessage`.

**Rationale**: Keeps all ephemeral streaming state co-located in one object, consistent with existing state management.

### D5: Footer shows the cumulative total duration across all responses in the session

**Decision**: `ChatState` gains a `totalDurationMs: 0` field. On each `usage_update`, `data.durationMs` (broadcast by the platform) is added to `ChatState.totalDurationMs`. On history load, `loadChatHistory` sums `metadata.durationMs` from all assistant messages and seeds `ChatState.totalDurationMs`. `updateUsageDisplay()` always reads `ChatState.totalDurationMs` directly and prepends `Duration: <formatted total>` to the footer. `formatUsage` does not change signature.

**Alternative discarded**: Show only the last response's duration in the footer. Rejected — a running total is more useful as a session-level summary. Per-message duration is already visible in each message header.

**Rationale**: The footer is a session summary bar. Showing a cumulative total (e.g. `Duration: 12m30s`) gives the user a sense of total agent compute time spent in the session, complementing the per-message granularity in the headers.

### D6: Display format is `0m0s · DD/MM/YYYY, HH:MM:SS`

The duration is shown first (most glanceable) followed by the wall-clock datetime of the `usage_update` (end of response). Locale formatting via `toLocaleString()` is acceptable — this is a developer tool, not an internationalized product.

## Risks / Trade-offs

- **[Risk] Agent sends no `thought_start` and no `message_chunk` before `usage_update`**: Start time will be null; duration will be omitted from the message header and metadata. Acceptable — means the response had no content.
- **[Trade-off] Duration reflects server wall-clock, not LLM compute time**: Network latency between platform and agent is included. This is intentional — it reflects the user's actual wait time.
- **[Risk] `messageStartTimes` leak if a session terminates mid-stream**: Entry remains in the Map indefinitely. Mitigation: entries are small (one number per session) and bounded by active sessions. A session-cleanup hook could clear them, but is out of scope for this change.

## Migration Plan

All changes are additive. Existing `chat.jsonl` records without `metadata.duration` render without a duration label — the UI checks for the field's existence before rendering. No migration of historical data needed.
