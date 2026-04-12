## Context

Currently, when a session is deleted from mimo-platform, the platform properly:
1. Deletes the session directory and fossil file
2. Sends a `session_ended` WebSocket message to the assigned agent via `agentService.notifySessionEnded()`

However, mimo-agent's `handleMessage()` method has no case for `"session_ended"`, causing the message to fall through to the default case and log "Unknown message type". The ACP provider process (opencode/claude-agent) continues running as an orphan, and the session remains in the agent's internal Maps (`acpClients`, `SessionManager.sessions`).

This results in a resource leak where ACP process count exceeds active session count.

## Goals / Non-Goals

**Goals:**
- Handle `session_ended` messages from platform in mimo-agent
- Properly terminate ACP provider processes when sessions are deleted
- Clean up all session-related resources (file watchers, timers, Maps)
- Ensure cleanup is idempotent (safe if called multiple times)

**Non-Goals:**
- Changing platform behavior (platform already sends correct message)
- Modifying the session deletion flow in platform
- Adding new session lifecycle states

## Decisions

### Decision: Reuse Existing `terminateSession()` Method

**Choice:** Use `SessionManager.terminateSession()` which already exists and handles:
- Killing ACP process with SIGTERM
- Closing file watcher
- Clearing pending changes and timers
- Removing from sessions Map

**Rationale:** No need to duplicate cleanup logic. The method was designed for this purpose but was never connected to the `session_ended` message.

### Decision: Remove from acpClients Map

**Choice:** Explicitly call `this.acpClients.delete(sessionId)` in the handler.

**Rationale:** While `terminateSession()` cleans up the SessionManager, `acpClients` is managed by `MimoAgent` class. The handler must clean up both.

### Decision: No Response Message Required

**Choice:** Do not send a response message to platform after cleanup.

**Rationale:** The platform has already deleted the session and doesn't wait for acknowledgment. The `session_ended` message is a notification, not a request-requires-response pattern.

### Decision: Idempotent Cleanup

**Choice:** Make handler safe to call multiple times for same session.

**Rationale:** Defensive programming - if platform sends duplicate messages or race conditions occur, cleanup should not fail or cause errors.

## Risks / Trade-offs

**[Risk] ACP process doesn't terminate cleanly**
- Current `terminateSession()` uses `process.kill("SIGTERM")` which gives the process a chance to clean up
- **Mitigation:** If SIGTERM fails, we may need SIGKILL fallback. For now, monitor logs for orphaned processes.

**[Risk] Platform sends session_ended for non-existent session in agent**
- If agent restarts, it may receive session_ended for sessions it doesn't know about
- **Mitigation:** Handler checks if session exists before attempting cleanup (idempotent by nature of Map operations)

**[Risk] Race condition between session_ended and active ACP request**
- User deletes session while ACP request is in flight
- **Mitigation:** `cancelCurrentRequest()` already handles aborting in-flight requests. The cleanup will kill the process which terminates any ongoing work.

## Implementation Sketch

```typescript
// In mimo-agent/src/index.ts handleMessage():
case "session_ended":
  this.handleSessionEnded(message);
  break;

// New method:
private handleSessionEnded(message: any): void {
  const sessionId = message.sessionId;
  if (!sessionId) {
    console.log("[mimo-agent] No sessionId in session_ended");
    return;
  }

  console.log(`[mimo-agent] Session ended: ${sessionId}`);

  // Remove from acpClients - idempotent if doesn't exist
  this.acpClients.delete(sessionId);

  // Terminate session - handles process, watcher, timers
  this.sessionManager.terminateSession(sessionId);
}
```
