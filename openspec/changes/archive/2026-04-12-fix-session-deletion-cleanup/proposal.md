## Why

When users delete a session from mimo-platform, the platform sends a `session_ended` WebSocket message to the assigned agent to notify it of the deletion. However, mimo-agent does not have a handler for this message type, resulting in ACP provider processes (opencode/claude-agent) remaining running as orphaned processes. This causes a resource leak where the number of ACP processes exceeds the number of active sessions.

## What Changes

- Add `session_ended` message handler to mimo-agent's WebSocket message router
- Implement `handleSessionEnded()` method to clean up session resources:
  - Terminate the ACP process for the session
  - Remove the session from acpClients Map
  - Terminate file watchers and pending timers
  - Clean up session from SessionManager
- Ensure idempotent cleanup (safe to call multiple times)

## Capabilities

### New Capabilities
- `agent-session-lifecycle`: Agent-side session lifecycle management and cleanup coordination

### Modified Capabilities
- `session-management`: Update to include agent notification requirements when session is deleted

## Impact

**Affected Code:**
- `packages/mimo-agent/src/index.ts` - Add message handler and cleanup method
- `packages/mimo-agent/src/session.ts` - May need adjustments for proper cleanup

**APIs:**
- WebSocket message protocol between platform and agent (adds `session_ended` handling)

**Dependencies:**
- No new dependencies

**Systems:**
- mimo-agent process lifecycle
- ACP provider process management (opencode, claude-agent)
