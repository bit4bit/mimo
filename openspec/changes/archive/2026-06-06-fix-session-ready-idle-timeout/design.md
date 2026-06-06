## Context

The platform sends a `session_ready` WebSocket message to the agent in two situations:

1. **Agent bootstrap** (`domain/agents/message-router.ts::handleAgentReady`) — includes the session's `idleTimeoutMs`.
2. **New chat thread creation** (`web/features/sessions/pages/sessions.tsx`, `POST /:id/chat-threads`) — currently does **not** include `idleTimeoutMs` (or other optional session fields such as `modelState`/`modeState`).

The agent's `handleSessionReady` unconditionally overwrites `sessionIdleTimeouts.set(sessionId, idleTimeoutMs)` even when `idleTimeoutMs` is missing, falling back to `600000`. This means:

- A user sets `idleTimeoutMs = 0`.
- Platform persists it and notifies the agent via `session_config_updated`.
- User creates a new thread.
- The thread-creation `session_ready` payload omits `idleTimeoutMs`.
- The agent reverts the cache to `600000`.
- Ten minutes later the session parks unexpectedly.

## Goals / Non-Goals

**Goals:**
- Ensure every `session_ready` payload sent to an already-bootstrapped agent carries the current session configuration.
- Prevent the agent from silently downgrading a cached non-default timeout to the hardcoded default.

**Non-Goals:**
- Changing the idle-timeout default (600000).
- Changing the validation rules (min 10000, allow 0).
- Changing the `session_config_updated` notification flow.

## Decisions

1. **Include `idleTimeoutMs` (and `modelState`/`modeState`) in thread-creation `session_ready`.**
   - *Rationale*: The thread-creation payload is already querying the full session record (`GET /sessions/:id`) to obtain credentials, fossil URL, and MCP servers. Adding three more scalar fields is trivial and makes the two code paths identical, eliminating a whole class of silent-reversion bugs.
   - *Alternative considered*: Send a separate `session_config_updated` after thread creation. Rejected because it introduces extra noise and still leaves a window where the agent cache is stale.

2. **Add a defensive "only update if present" guard on the agent side.**
   - *Rationale*: Even after fixing every known `session_ready` sender, future routes could make the same mistake. A one-line null-check in `handleSessionReady` (`typeof idleTimeoutMs === "number" ? ... : keep existing`) acts as a safety net.
   - *Alternative considered*: Treat missing field as "keep existing" by default. This is the same as the guard, just expressed differently.

## Risks / Trade-offs

- **[Risk] Agent cache could become permanently stale if the platform never sends `idleTimeoutMs` in any `session_ready` for a session.**
  → *Mitigation*: The bootstrap `session_ready` from `message-router.ts` already guarantees the field is present on first connect. The thread-creation fix guarantees it on subsequent sends. The guard only skips when the field is *missing*, not `0`.

- **[Risk] Adding extra fields to the thread-creation payload increases WebSocket message size slightly.**
  → *Mitigation*: These are tiny scalar values (a small integer, two small objects). Impact is negligible compared to fossil credentials and MCP server lists already present.

- **[Risk] The `modelState` and `modeState` additions are out of scope for the original bug report, but they exhibit the same omission risk.**
  → *Mitigation*: Include them in the same fix to prevent future regression. No extra test overhead since the thread-creation test already needs to inspect the payload.
