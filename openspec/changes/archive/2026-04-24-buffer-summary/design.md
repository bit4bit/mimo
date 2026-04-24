## Context

The right frame currently holds Notes, Impact, and MCP buffers. Each is a static `BufferConfig` registered in `buffers/index.ts` and rendered by `Frame.tsx`. The `ChatService` stores thread history as `.jsonl` per thread. The `AgentService` routes messages to agents via WebSocket ACP. The `ConfigService` reads/writes a YAML config file using `js-yaml`, with a well-established `sanitize*` pattern for each config section.

The Summary buffer needs to:
1. Read history from one thread
2. Send it to another thread's live agent
3. Stream the response back to the client
4. Hold the result ephemerally in the browser

## Goals / Non-Goals

**Goals:**
- New right-frame `Summary` buffer with two thread selectors and Refresh button
- Async summarization: load history → send to agent via ACP → stream back
- Configurable system prompt via `config.yaml` under `summary.prompt`
- Sane default prompt if not configured
- Thread state indicators (🟢/🔴/⏳) on selectors

**Non-Goals:**
- Persisting summaries (ephemeral only)
- Auto-refresh on history change
- Hiding the summary request from the summarize-via thread's history
- Summarizing across multiple threads at once

## Decisions

### D1: Summarization goes through ACP (existing agent pipe)

**Decision:** Send the summarization prompt to the selected summarize-via thread's agent via the existing ACP `/chat` endpoint.

**Rationale:** Reuses battle-tested infrastructure. No new LLM client needed. Consistent with how all other agent interactions work.

**Alternative considered:** Direct LLM call bypassing ACP. Rejected — requires injecting provider credentials into a new code path, adds complexity, and creates a divergent execution model.

**Trade-off:** The summarize request appears in the summarize-via thread's history. Acceptable — users are expected to use a dedicated summary thread.

---

### D2: Summary output held ephemerally on the client

**Decision:** The server streams the summary response back. The client holds it in a JS variable. On reload it is gone.

**Rationale:** No storage schema changes. No cleanup logic. The feature's primary value is in-session awareness, not archival.

**Alternative considered:** Write to a `summary.md` in the session dir. Rejected — adds read/write surface and cleanup edge cases for no clear benefit.

---

### D3: New `/summary/refresh` POST endpoint

**Decision:** A POST to `/sessions/:id/summary/refresh` with `{ analyzeThreadId, summarizeThreadId }` drives the flow. Response is streamed (SSE or chunked).

**Rationale:** Clean separation from the ACP chat endpoint. Allows the server to orchestrate: load history → build prompt → proxy ACP response back.

**Alternative considered:** Reusing the existing ACP chat endpoint directly from the client. Rejected — the client would need to format the full history payload and manage the prompt template itself, leaking server concerns.

---

### D4: Prompt stored in `config.yaml` under `summary.prompt`

**Decision:** Add `SummaryConfig { prompt?: string }` to `Config`. Use `sanitizeSummaryConfig()` following the existing pattern in `config/service.ts`.

**Rationale:** Consistent with how all other config sections work. Users already know where to configure behavior.

**Default prompt:**
```
Analyze the following conversation history in chronological order.
Produce a concise structured summary covering: main topics discussed,
decisions made, current state, and any open questions.
History:
```

---

### D5: Thread selector shows all threads (not filtered by state)

**Decision:** Both dropdowns list all session threads. State indicator (🟢/🔴/⏳/🔴) shown next to each option.

**Rationale:** Analyze-thread has no state requirement. Summarize-via thread must be active — validated server-side with a clear error returned if not.

**Error handling:** If summarize-via thread has no active agent, the endpoint returns `400` with message rendered inline in the buffer.

## Risks / Trade-offs

- **Risk:** Summarize-via thread gets polluted with summary prompts → **Mitigation:** Document that a dedicated summary thread is recommended. No mitigation in code (intentional per D1).
- **Risk:** Large history payloads hit agent context limits → **Mitigation:** Out of scope for this change. Future: truncation strategy.
- **Risk:** Streaming response complexity on the client → **Mitigation:** Use the same SSE pattern already in use for chat streaming.

## Migration Plan

No migration needed. New buffer is additive. Default frame state (Impact active) unchanged per frame-buffers spec R6.

## Open Questions

- None. All decisions resolved in exploration.
