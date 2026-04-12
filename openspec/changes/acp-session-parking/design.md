## Context

Currently, mimo-agent keeps ACP (Agent Client Protocol) processes running indefinitely for each active session. This consumes system resources (memory, CPU) even when users are not actively interacting with the agent. Users may have multiple sessions open across different projects, but only actively use one at a time.

The ACP protocol supports session resumption via `loadSession()` for both opencode and claude-agent-acp providers, but mimo-agent doesn't take advantage of this for resource management.

## Goals / Non-Goals

**Goals:**
- Automatically "park" idle ACP sessions after a configurable timeout (default: 10 minutes)
- Transparently resume parked sessions when user sends a new prompt
- Cache ACP configuration (model, mode, session ID) in mimo-platform for seamless resumption
- Show subtle UI indicator of ACP status (active/parked/waking)
- Queue prompts that arrive during wake-up to prevent loss
- Support both opencode and claude-agent-acp providers uniformly

**Non-Goals:**
- Persist LLM conversation context across parking (ACP provider handles this via loadSession)
- Support parking for providers that don't implement session/load
- Implement server-side LLM context caching
- Change the ACP protocol or provider implementations

## Decisions

### Decision: Session parking state managed entirely in mimo-agent

**Rationale:** The parking/resumption logic is provider-specific and session-lifecycle-related, making mimo-agent the natural place. Mimo-platform only caches configuration and displays status.

**Alternative considered:** Manage parking state in mimo-platform. Rejected because platform would need provider-specific knowledge and process management, which breaks separation of concerns.

### Decision: Use ACP `loadSession()` for resumption

**Rationale:** Both providers support this method - opencode via `session/load` extMethod, claude via native `loadSession`. This preserves LLM conversation context if the provider still has it.

**Alternative considered:** Always start fresh with `newSession()`. Rejected because it would lose conversation context even when provider could preserve it.

### Decision: Cache configuration in session.yaml, not separate file

**Rationale:** Keeping ACP-related fields (`idleTimeoutMs`, `acpSessionId`, `modelState`, `modeState`) alongside other session metadata provides atomic updates and simpler recovery.

**Alternative considered:** Separate cache file. Rejected because it adds complexity and potential inconsistency.

### Decision: Minimum idle timeout of 10 seconds

**Rationale:** Prevents excessive park/resume cycles that could destabilize the system.

**Alternative considered:** No minimum. Rejected because very short timeouts (e.g., 1 second) would cause thrashing.

### Decision: Value of 0 disables parking entirely

**Rationale:** Some users may want ACP always available for immediate response, accepting the resource cost.

### Decision: Queue prompts during wake-up rather than reject

**Rationale:** Better UX - user can type multiple messages without waiting for agent to fully wake.

**Alternative considered:** Return error "agent waking, retry later". Rejected because it puts burden on user.

### Decision: Stop file watcher when parked

**Rationale:** File watcher uses resources (inotify handles, CPU for polling). Since user isn't actively working, changes can be synced on resumption.

**Alternative considered:** Keep file watcher running. Rejected because it partially defeats the resource-saving goal.

## Risks / Trade-offs

**[Risk] First prompt after idle has higher latency** → Mitigation: Show "waking" indicator so user understands; typically 1-2 seconds which is acceptable for idle recovery.

**[Risk] Session resumption fails if provider cleaned up** → Mitigation: Fall back to newSession(), show message to user, continue with prompt. Chat history preserved in mimo-platform.

**[Risk] Multiple rapid prompts during wake-up** → Mitigation: Queue implementation with sequential processing; UI shows "queued" state.

**[Risk] Platform restarts while agent parked** → Mitigation: All state is on disk in session.yaml; agent reconnects and resumes normally.

**[Risk] File changes during parking are not synced** → Mitigation: On resumption, sync current state. Trade-off accepted: external changes during idle may be missed until user interacts.

**[Trade-off] Resource savings vs. responsiveness** → Parking saves resources but adds 1-2 second latency on first prompt. Balanced by configurability (users can set longer timeout or disable).

## Migration Plan

1. **Schema migration**: Session YAML gets new optional fields with defaults:
   - `idleTimeoutMs`: 600000 (backward compatible - existing sessions get default)
   - `acpSessionId`: null
   - `modelState`: null  
   - `modeState`: null
   - `acpStatus`: "active"

2. **No breaking changes**: Existing sessions without these fields continue working with default behavior (no parking until timeout configured).

3. **Rollback**: If issues arise, can disable parking globally by setting `idleTimeoutMs: 0` in all sessions.

## Open Questions

1. Should we expose idle timeout configuration in UI, or only via API initially?
2. Should we track parking statistics (number of parks, average wake time) for monitoring?
3. How should we handle model/mode changes while parked? (Defer until active?)
