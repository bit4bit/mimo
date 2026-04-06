## Context

Currently, mimo-agent spawns a new ACP process for each user message, creating a fresh ACP session every time. When mimo-agent restarts (crash, redeploy, etc.), any in-memory state is lost. While mimo-platform persists chat history in `chat.jsonl`, the ACP session context (conversation state, model configuration, etc.) is completely reset.

The ACP protocol supports `loadSession()` for resuming existing sessions, but this capability:
1. Is optional (agents advertise it via `agentCapabilities.loadSession`)
2. Requires the client (mimo-agent) to persist the `acpSessionId` returned from `newSession()`

We need a mechanism to:
- Store ACP session IDs in mimo-platform (the source of truth for session state)
- Send the persisted ID to mimo-agent on reconnection
- Handle capability detection and graceful fallback

## Goals / Non-Goals

**Goals:**
- Persist ACP session IDs in mimo-platform session storage
- Enable ACP session resumption when mimo-agent reconnects (if supported)
- Provide transparent session reset notification when resumption is not possible
- Maintain backward compatibility with ACP agents that don't support `loadSession`

**Non-Goals:**
- Changing the fundamental per-message ACP session lifecycle
- Persistent agent-side state (mimo-agent remains stateless)
- Automatic retry logic for failed `loadSession` calls
- Migration of existing sessions (they'll start fresh on next agent connect)

## Decisions

### Decision 1: Platform Owns Session Persistence
**Choice:** Store `acpSessionId` in mimo-platform's session.yaml, not in mimo-agent.

**Rationale:** 
- mimo-platform is the source of truth for session metadata
- mimo-agent is designed to be ephemeral/stateless
- Simplifies agent implementation - just receives the ID on connect

**Alternative:** Agent-side persistence (rejected): Would require agent to manage durable storage, complicating deployment and violating the stateless design.

### Decision 2: Capability-Aware Resumption
**Choice:** Check `agentCapabilities.loadSession` and handle all cases explicitly.

**Rationale:**
- ACP spec marks `loadSession` as optional
- Graceful degradation provides better UX than hard failures
- Clear system messages keep users informed

**Flow:**
```
Agent connects
    ↓
Initialize ACP connection
    ↓
Check capabilities
    ├─ loadSession=true AND acpSessionId exists → try loadSession()
    │   ├─ Success → session resumed
    │   └─ Failure → newSession() + reset notification
    └─ loadSession=false OR no acpSessionId → newSession() + reset notification
```

### Decision 3: Explicit Reset Notification
**Choice:** Append system message to chat.jsonl when session is reset.

**Rationale:**
- Users need visibility into when conversation context changes
- Timestamp provides audit trail
- Distinguishes between "resumed" (seamless) vs "reset" (new context)

**Message Format:**
```json
{
  "role": "system",
  "content": "Session reset at 2026-04-07 15:30:45 (loadSession not supported)",
  "timestamp": "2026-04-07T15:30:45.000Z"
}
```

### Decision 4: Minimal WebSocket Protocol Extension
**Choice:** Add single field to existing `session_ready` message and single new message type `acp_session_created`.

**Rationale:**
- Minimizes changes to existing communication patterns
- `session_ready` already sends session configuration, natural place for acpSessionId
- `acp_session_created` provides clear lifecycle event

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `loadSession` fails silently | Low | Medium | Explicit error handling with fallback to newSession() |
| Stale acpSessionId causes errors | Low | Low | Catch loadSession errors, treat as new session |
| Chat history becomes confusing with resets | Medium | Low | Clear system messages with timestamps |
| ACP agent capabilities change between versions | Low | Low | Check capabilities on every connect, not cached |

**Trade-offs:**
- System messages add noise to chat history, but provide important context
- Additional YAML field increases storage slightly, but negligible impact
- Extra message roundtrip (acp_session_created) adds latency, but only on agent connect

## Migration Plan

**Deployment:**
1. Update mimo-platform to support new WebSocket protocol (backward compatible - acpSessionId is optional)
2. Update mimo-agent to send/receive new message types
3. Deploy mimo-platform
4. Deploy mimo-agent

**Rollback:**
- Remove `acpSessionId` field from session.yaml (optional field, safe to ignore)
- Revert to previous agent version (will receive acpSessionId but ignore it, creating fresh sessions)

**Existing Sessions:**
- Sessions without `acpSessionId` will behave exactly as before (new ACP session each time)
- Field will be populated on first successful agent connection

## Open Questions

None - design is ready for implementation.
