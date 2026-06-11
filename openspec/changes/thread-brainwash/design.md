## Context

The existing tool-approval system always routes permission requests through a full browser round-trip: ACP agent → MimoAgent WS → Platform WS → Browser UI → user click → Browser WS → Platform WS → MimoAgent WS → ACP agent. There is no server-side bypass or auto-approval path. Users working in trusted threads want to eliminate this interruption.

The `threadConfigs` map in `MimoAgent` already stores per-thread configuration (model, mode, acpSessionId) and is checked during ACP process spawn. The `buildAcpCallbacks` method creates the `onPermissionRequest` callback that bridges ACP protocol to browser UI.

## Goals / Non-Goals

**Goals:**
- Add a per-thread "brain-wash" toggle that auto-approves all tool permission requests
- Persist the setting in the existing session YAML storage (survives restarts)
- Auto-approve at the earliest possible point (agent-side, zero browser latency)
- Keep the existing permission flow unchanged when brain-wash is off
- Show a visual indicator in chat when brain-wash auto-approves a tool

**Non-Goals:**
- Global/session-wide auto-approval (this is deliberately per-thread)
- Pattern-based auto-approval (e.g., "allow git *") — that's a separate concern
- Changing the ACP protocol or provider behavior
- Modifying the Plan mode permission model (mode is orthogonal to brain-wash)

## Decisions

### Decision 1: Auto-resolve in the agent, not the platform

Intercept permission requests in `MimoAgent.buildAcpCallbacks().onPermissionRequest`, before the WebSocket message is sent to the platform.

**Rationale:**
- The `threadConfigs` map already lives in the agent and is keyed by `acpKey(sessionId, chatThreadId)` — the exact key needed
- Zero latency: no WS message sent, no waiting for browser
- Works when no browser tab is open
- The agent is the closest point to the ACP protocol boundary; platform/browser are downstream consumers

**Alternative considered:** Intercept in `AgentMessageRouter.handlePermissionRequest()` (platform). Rejected because:
- Adds an unnecessary agent→platform hop before the auto-resolve
- Platform would need to send a synthetic `permission_response` back to the agent
- Platform doesn't track per-thread config naturally — it would need a lookup through the session repository

### Decision 2: Return `"always_allow"` optionId when available

When brain-wash is on, resolve with `{ outcome: "selected", optionId: "always_allow" }` if the ACP options include that ID. Fall back to `"allow_once"` if not present.

**Rationale:**
- "always_allow" semantically matches the intent — the user is saying "always allow everything"
- If the ACP SDK honors `always_allow`, subsequent tool calls within the same ACP session may also be auto-approved at the provider level, reducing protocol overhead
- Graceful degradation: if the provider doesn't offer "always_allow", "allow_once" still works

### Decision 3: Reuse existing `updateChatThread` API for persistence

Add `brainWash` to the `ChatThread` interface and to the `Partial<Pick<...>>` type in `updateChatThread`. The browser sends a PATCH to the existing `/sessions/:id/chat-threads/:threadId` endpoint with `{ brainWash: true }`.

**Rationale:**
- No new API endpoint needed
- `js-yaml` serialization handles the new boolean field automatically
- `updateChatThread` already validates name uniqueness for that method — brainWash has no such constraint

### Decision 4: Broadcast auto-approval events to browser

When brain-wash auto-approves a tool, send a lightweight `permission_auto_allowed` message to the platform so the browser can show an inline indicator (e.g., "⚡ Tool auto-allowed (brain-wash)").

**Rationale:**
- Keeps the user informed without blocking
- The existing `permission_request` / `permission_resolved` broadcast pattern already exists; this is a simpler variant
- If we skip the broadcast, the user sees nothing and may wonder if the agent is stuck

**Alternative considered:** Show a normal permission card but pre-filled. Rejected because the whole point is to eliminate the interruption.

### Decision 5: Brain-wash state survives park/wake cycles

The brain-wash flag is persisted in the session YAML via `ChatThread.brainWash`. On park/wake, the flag is re-read from YAML and forwarded to the agent via `session_ready` / `request_state`. The agent stores it in `threadConfigs` and checks it in `onPermissionRequest`.

**Rationale:**
- `threadConfigs` is populated on bootstrap and on state request — both paths already exist
- On park, the `AcpClient` is destroyed but `threadConfigs` remains. On wake, a new `AcpClient` is created with the same callbacks, which check the same `threadConfigs` entry
- No additional state synchronization needed

## Risks / Trade-offs

- **Risk:** User enables brain-wash, forgets about it, and later wonders why tools auto-execute. → **Mitigation:** Checkbox is visible in the thread header at all times; auto-allowed tools show an inline indicator in chat.
- **Risk:** `"always_allow"` may not be supported by all ACP providers. → **Mitigation:** Graceful fallback to `"allow_once"` if the option isn't found in the options array.
- **Trade-off:** Brain-wash is binary (on/off). Some users might want per-tool-pattern auto-approval. That is a separate, more complex feature — not in scope here.
