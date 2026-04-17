## Context

Sessions currently require an agent to be selected at creation time. The agent drives model/mode availability via `session_initialized`, making thread creation dependent on a session that already has an agent. This coupling prevents threads from independently owning their agent assignment and blocks multi-agent usage within a single session.

The `ChatThread` entity already has its own `acpSessionId` and `state` fields, signaling that the architecture already treats threads as the natural unit of ACP lifecycle. This change completes that design intent.

## Goals / Non-Goals

**Goals:**
- Move agent selection from session creation to thread creation
- Each thread independently owns its `assignedAgentId`
- Agent advertises model/mode capabilities on connect so the thread creation dialog can populate synchronously
- Capabilities are persisted on the agent entity and served via a dedicated endpoint

**Non-Goals:**
- Changing the fossil checkout or VCS lifecycle (still session-scoped)
- Supporting agents from different providers in the same thread
- Migrating existing sessions with `assignedAgentId` (backward compat handled by nullability)

## Decisions

### D1 — Agent advertises capabilities immediately on connect

**Decision**: Agent sends an `agent_capabilities` message right after `agent_ready` on every connect. Platform stores `{ availableModels, defaultModelId, availableModes, defaultModeId }` on `agent.yaml`.

**Why**: Thread creation dialog must populate model/mode synchronously when the user picks an agent. This requires capabilities to be available before any session or thread is created. Advertising on connect (not just `session_initialized`) guarantees the data is always current.

**Alternative considered**: Derive from provider type (`opencode` | `claude`) using static lists. Rejected — would require updating platform code whenever a provider adds models, and doesn't reflect per-instance configuration.

### D2 — New `GET /agents/:agentId/capabilities` endpoint

**Decision**: Expose a lightweight endpoint that returns the cached `modelState` and `modeState` from `agent.yaml`. The dialog fetches this on agent `<select>` `onChange`.

**Why**: Avoids pre-loading all agents' capabilities into the page globals. Only the selected agent's data is needed, and only when the user makes a selection.

### D3 — `assignedAgentId` stored on `ChatThread`, nullable on `Session`

**Decision**: `ChatThread` gains `assignedAgentId: string | null`. Session creation no longer sets `assignedAgentId` at all (field may be removed or left nullable for legacy compatibility).

**Why**: Threads are already the granularity at which ACP sessions live (`acpSessionId`, parking state). Making agent assignment thread-level completes this design.

**Alternative considered**: Keep `assignedAgentId` on Session as a default, inherited by threads. Rejected — creates implicit coupling and contradicts the goal of independent thread agents.

### D4 — Thread creation triggers `session_ready` if agent is online

**Decision**: When `POST /sessions/:id/chat-threads` includes `assignedAgentId`, the backend checks if that agent is online and sends `session_ready` immediately. If offline, the thread waits (existing parking/waking path handles reconnect).

**Why**: Matches the existing trigger pattern — same mechanism as before, just moved from session creation to thread creation.

### D5 — `session_initialized` re-caches capabilities on agent

**Decision**: Existing `session_initialized` handler updates agent's cached `modelState`/`modeState` in addition to syncing the thread. This keeps capabilities fresh after each ACP start.

**Why**: The agent may update its model/mode availability across restarts (e.g., new models added). Re-caching on `session_initialized` ensures stale capabilities don't persist indefinitely.

## Risks / Trade-offs

- **Agent offline at thread creation** → Thread is created but ACP hasn't started yet. Capabilities shown in dialog are from cached state (last connect), which may differ from the agent's current state. Mitigation: re-cache on `session_initialized` corrects any drift.
- **Agent has never connected** → No cached capabilities. Mitigation: `agent_capabilities` is sent on every connect; a never-connected agent is `offline` and would not normally be selectable (UI can filter to online agents).
- **Session `assignedAgentId` removal** → Existing sessions in the wild have this field set. Mitigation: field stays in the schema as nullable; no migration needed since it's simply ignored in the new creation flow.

## Migration Plan

1. Deploy backend changes (new endpoint, thread schema update, `agent_capabilities` handler) before frontend changes — old clients still work.
2. Deploy frontend changes (remove agent from session form, add agent to thread dialog).
3. No data migration required; existing threads without `assignedAgentId` continue to function via the current `session_initialized` → model/mode sync path.
